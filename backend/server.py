"""Loopback HTTP API, bot polling and persistent scheduled delivery."""
import hashlib, json, os, threading, time, urllib.request, urllib.error
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, urlsplit
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import Json
from model import Invalid, telegram_user, session_token, session_user, validate_state, due_alarms

TOKEN=os.environ['BOT_TOKEN']; SECRET=os.environ['SESSION_SECRET']; URL=os.environ['APP_URL'].rstrip('/')
DSN=os.environ.get('DATABASE_DSN','dbname=survival_analytics'); BOT='bpjournalbot'

@contextmanager
def db():
    connection=psycopg2.connect(DSN, connect_timeout=5, options='-c statement_timeout=5000')
    try:
        with connection: yield connection
    finally: connection.close()
def telegram(method, payload, timeout=25):
    request=urllib.request.Request(f'https://api.telegram.org/bot{TOKEN}/{method}', data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=timeout) as response: result=json.load(response)
        return result
    except urllib.error.HTTPError as error:
        return {'ok':False,'error_code':error.code}
    except Exception:
        return {'ok':False,'error_code':0}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,data):
        raw=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def body(self):
        size=int(self.headers.get('Content-Length','0'))
        if size<=0 or size>4*1024*1024: raise Invalid('body')
        return json.loads(self.rfile.read(size))
    def user(self):
        auth=self.headers.get('Authorization','')
        if not auth.startswith('Bearer '): raise Invalid('auth')
        return session_user(auth[7:],SECRET)
    def do_GET(self): self.handle_api('GET')
    def do_POST(self): self.handle_api('POST')
    def do_PUT(self): self.handle_api('PUT')
    def handle_api(self,method):
        path=urlsplit(self.path).path
        try:
            if path=='/api/health' and method=='GET':
                with db() as connection, connection.cursor() as cur: cur.execute('SELECT 1')
                return self.reply(200,{'ok':True})
            if path=='/api/config' and method=='GET': return self.reply(200,{'bot':BOT,'appUrl':URL})
            if path=='/api/auth' and method=='POST':
                body=self.body()
                try: user=telegram_user(body.get('initData',''),TOKEN)
                except (ValueError,KeyError,TypeError): return self.reply(401,{'error':'Откройте дневник заново через Telegram.'})
                with db() as connection, connection.cursor() as cur:
                    cur.execute('INSERT INTO health_diary.users(telegram_id) VALUES(%s) ON CONFLICT DO NOTHING',(user['id'],))
                    if user.get('allows_write_to_pm') is True:
                        cur.execute('UPDATE health_diary.users SET chat_id=%s, can_message=true WHERE telegram_id=%s',(user['id'],user['id']))
                return self.reply(200,{'token':session_token(user['id'],SECRET)})
            try: user_id=self.user()
            except Invalid: return self.reply(401,{'error':'Сессия истекла. Откройте дневник заново в Telegram.'})
            if path=='/api/state' and method=='GET':
                with db() as connection, connection.cursor() as cur:
                    cur.execute('SELECT state,revision,can_message FROM health_diary.users WHERE telegram_id=%s',(user_id,)); row=cur.fetchone()
                if not row: return self.reply(401,{'error':'Откройте дневник в Telegram.'})
                return self.reply(200,{'state':row[0],'revision':row[1],'canMessage':row[2]})
            if path=='/api/state' and method=='PUT':
                body=self.body(); state=validate_state(body.get('state')); revision=body.get('revision')
                if type(revision) is not int: raise Invalid('revision')
                with db() as connection, connection.cursor() as cur:
                    cur.execute('UPDATE health_diary.users SET state=%s,revision=revision+1,updated_at=now() WHERE telegram_id=%s AND revision=%s RETURNING revision',(Json(state),user_id,revision)); row=cur.fetchone()
                if not row: return self.reply(409,{'error':'Дневник изменён на другом устройстве. Закройте и откройте его заново перед сохранением.'})
                return self.reply(200,{'revision':row[0]})
            return self.reply(404,{'error':'Не найдено.'})
        except (Invalid,ValueError,TypeError,KeyError,OverflowError): self.reply(400,{'error':'Проверьте данные записи или расписания.'})
        except Exception:
            print('api_request_failed',flush=True)
            self.reply(503,{'error':'Сервер временно недоступен. Изменения пока не сохранены.'})


def process_update(update):
    message=update.get('message',{}); chat=message.get('chat',{}); user=message.get('from',{})
    if chat.get('type')!='private' or not user.get('id') or chat.get('id')!=user['id']: return
    allowed=bool(message.get('write_access_allowed')) or bool(message.get('text','').startswith('/start'))
    if not allowed: return
    with db() as connection, connection.cursor() as cur:
        cur.execute('INSERT INTO health_diary.users(telegram_id,chat_id,can_message) VALUES(%s,%s,true) ON CONFLICT(telegram_id) DO UPDATE SET chat_id=EXCLUDED.chat_id,can_message=true',(user['id'],chat['id']))
    if message.get('text','').startswith('/start'):
        telegram('sendMessage',{'chat_id':chat['id'],'text':'Дневник давления и веса. Записывайте измерения, смотрите графики и настраивайте напоминания.','reply_markup':{'inline_keyboard':[[{'text':'Открыть дневник','web_app':{'url':URL}}]]}})

def poll():
    while True:
        try:
            with db() as connection, connection.cursor() as cur:
                cur.execute('SELECT update_offset FROM health_diary.bot_state WHERE id=1'); offset=cur.fetchone()[0]
            result=telegram('getUpdates',{'offset':offset,'timeout':20,'allowed_updates':['message']})
            if not result.get('ok'): time.sleep(5); continue
            for update in result['result']:
                process_update(update)
                with db() as connection, connection.cursor() as cur: cur.execute('UPDATE health_diary.bot_state SET update_offset=%s WHERE id=1',(update['update_id']+1,))
        except Exception:
            print('bot_poll_failed',flush=True); time.sleep(5)

def scheduler():
    while True:
        try:
            with db() as connection, connection.cursor() as cur:
                cur.execute('SELECT telegram_id,chat_id,state FROM health_diary.users WHERE can_message AND state IS NOT NULL'); users=cur.fetchall()
            now=datetime.now(timezone.utc)
            for user_id,chat_id,state in users:
                for event in due_alarms(state,now):
                    # Claim before sending: a timeout never triggers duplicate medical reminders.
                    with db() as connection, connection.cursor() as cur:
                        cur.execute("INSERT INTO health_diary.deliveries(telegram_id,delivery_key,status) VALUES(%s,%s,'sending') ON CONFLICT DO NOTHING RETURNING delivery_key",(user_id,event['delivery_key']))
                        if not cur.fetchone(): continue
                    link=URL+'/?'+urlencode({'record':event['kind'],'reminder':event['key']})
                    label='давление' if event['kind']=='bp' else 'вес'
                    result=telegram('sendMessage',{'chat_id':chat_id,'text':f'Пора измерить {label}.','reply_markup':{'inline_keyboard':[[{'text':'Записать измерение','web_app':{'url':link}}]]}})
                    with db() as connection, connection.cursor() as cur:
                        cur.execute('UPDATE health_diary.deliveries SET status=%s,message_id=%s WHERE telegram_id=%s AND delivery_key=%s',('sent' if result.get('ok') else 'failed',result.get('result',{}).get('message_id'),user_id,event['delivery_key']))
                        if result.get('error_code')==403: cur.execute('UPDATE health_diary.users SET can_message=false WHERE telegram_id=%s',(user_id,))
        except Exception: print('scheduler_failed',flush=True)
        time.sleep(15)

if __name__=='__main__':
    threading.Thread(target=poll,daemon=True).start(); threading.Thread(target=scheduler,daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1',8791),Handler).serve_forever()
