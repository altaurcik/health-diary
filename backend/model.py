"""Validation, Telegram authentication and alarm planning; no I/O."""
import base64, hashlib, hmac, json, math, re, time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

class Invalid(ValueError): pass

def telegram_user(raw, token, now=None):
    now = time.time() if now is None else now
    fields = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
    if len(dict(fields)) != len(fields): raise Invalid('duplicate fields')
    data = dict(fields); signature = data.pop('hash', '')
    check = '\n'.join(f'{k}={v}' for k,v in sorted(data.items()))
    secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature): raise Invalid('signature')
    stamp = int(data.get('auth_date', 0))
    if stamp > now + 30 or now - stamp > 86400: raise Invalid('expired')
    user = json.loads(data.get('user','{}'))
    if not isinstance(user.get('id'), int) or isinstance(user['id'], bool) or user['id'] <= 0: raise Invalid('user')
    return user

def session_token(user_id, secret, now=None):
    payload = f'{user_id}.{int(now or time.time())+43200}'
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}.{signature}'

def session_user(value, secret, now=None):
    try:
        user, expiry, signature = value.split('.')
        expected = hmac.new(secret.encode(), f'{user}.{expiry}'.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature) or int(expiry) <= (now or time.time()) or int(user) <= 0: raise Invalid('session')
        return int(user)
    except (ValueError, TypeError): raise Invalid('session') from None

def instant(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None: raise Invalid('timezone missing')
        return parsed
    except (ValueError, TypeError, AttributeError): raise Invalid('date') from None

def numeric(value, low, high, integer=False):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and low <= value <= high and (not integer or int(value)==value)

def validate_state(state, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(state,dict) or state.get('version') != 2: raise Invalid('version')
    profile=state.get('profile',{}); records=state.get('records'); schedules=state.get('schedules'); actions=state.get('reminderActions')
    if not isinstance(profile,dict) or not isinstance(records,list) or len(records)>20000 or not isinstance(schedules,list) or len(schedules)>100 or not isinstance(actions,dict) or len(actions)>20000: raise Invalid('format/limit')
    try: ZoneInfo(profile.get('timezone',''))
    except (ZoneInfoNotFoundError,ValueError,TypeError): raise Invalid('timezone') from None
    if profile.get('theme') not in ['dark','light','system'] or profile.get('sex') not in ['', 'male','female','unspecified']: raise Invalid('profile')
    if profile.get('height','') != '' and not numeric(profile['height'],50,250): raise Invalid('height')
    birth=profile.get('birthDate','')
    if birth:
        try:
            day=datetime.strptime(birth,'%Y-%m-%d').date()
            if day.year<1900 or day>now.date(): raise ValueError()
        except (ValueError,TypeError): raise Invalid('birth') from None
    seen=set()
    for r in records:
        if not isinstance(r,dict) or not isinstance(r.get('id'),str) or not 1<=len(r['id'])<=128 or r['id'] in seen: raise Invalid('record id')
        seen.add(r['id']); at=instant(r.get('at'))
        if at>now+timedelta(minutes=2): raise Invalid('future')
        if r.get('timestamp') is not None and abs(r['timestamp']-at.timestamp()*1000)>0.01: raise Invalid('timestamp')
        if not isinstance(r.get('comment',''),str) or len(r.get('comment',''))>300: raise Invalid('comment')
        if r.get('kind')=='bp':
            if not numeric(r.get('systolic'),30,300,True) or not numeric(r.get('diastolic'),20,200,True) or r['systolic']<=r['diastolic']: raise Invalid('pressure')
            if r.get('pulse') is not None and not numeric(r['pulse'],20,250,True): raise Invalid('pulse')
        elif r.get('kind')=='weight':
            if not numeric(r.get('weight'),10,500): raise Invalid('weight')
        else: raise Invalid('kind')
    seen=set()
    for s in schedules:
        if not isinstance(s,dict) or not isinstance(s.get('id'),str) or not 1<=len(s['id'])<=128 or s['id'] in seen: raise Invalid('alarm id')
        seen.add(s['id'])
        if s.get('kind') not in ['all','bp','weight'] or type(s.get('enabled')) is not bool or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',s.get('time','')): raise Invalid('alarm')
        days=s.get('days')
        if s.get('frequency')!='weekly' or not isinstance(days,list) or any(type(d) is not int or not 0<=d<=6 for d in days) or len(set(days))!=len(days) or (s['enabled'] and not days): raise Invalid('days')
    for key, action in actions.items():
        if not isinstance(key,str) or len(key)>250 or not (action in ['done','skip'] if isinstance(action,str) else numeric(action,0,1e14)): raise Invalid('action')
    return state

def due_alarms(state, now):
    """Only current due occurrences (10 min grace); no historical reminder flood."""
    zone=ZoneInfo(state['profile']['timezone']); local=now.astimezone(zone); actions=state['reminderActions']
    for schedule in state['schedules']:
        if not schedule['enabled']: continue
        for delta in [-1,0]:
            day=local.date()+timedelta(days=delta)
            if (day.weekday()+1)%7 not in schedule['days']: continue
            naive=datetime.fromisoformat(f'{day.isoformat()}T{schedule["time"]}')
            planned=naive.replace(tzinfo=zone,fold=0)
            if planned.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)!=naive: continue
            for kind in ['bp','weight'] if schedule['kind']=='all' else [schedule['kind']]:
                key=f'{schedule["id"]}:{day}:{schedule["time"]}:{kind}'; action=actions.get(key)
                if action in ['done','skip']: continue
                due=datetime.fromtimestamp(action/1000,timezone.utc) if isinstance(action,(int,float)) else planned.astimezone(timezone.utc)
                age=(now-due).total_seconds()
                if 0<=age<600: yield {'key':key,'kind':kind,'due':due,'delivery_key':f'{key}:{int(due.timestamp())}'}
