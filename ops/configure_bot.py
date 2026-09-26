"""Run on the server after bootstrap; prints no secrets or raw API responses."""
import json, urllib.request, urllib.error
from pathlib import Path
values={}
for line in Path('/etc/health-diary/app.env').read_text().splitlines():
    if line and not line.startswith('#'):
        key,value=line.split('=',1);values[key]=value

def call(method,body):
    request=urllib.request.Request('https://api.telegram.org/bot'+values['BOT_TOKEN']+'/'+method,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=20) as response: result=json.load(response)
    except Exception: raise SystemExit('Telegram request failed: '+method) from None
    if not result.get('ok'): raise SystemExit('Telegram rejected: '+method)
    return result['result']
me=call('getMe',{})
if me.get('username')!='bpjournalbot': raise SystemExit('Unexpected bot identity; stopped.')
if call('getWebhookInfo',{}).get('url'): raise SystemExit('Existing webhook detected; stopped before changing bot configuration.')
call('setChatMenuButton',{'menu_button':{'type':'web_app','text':'Открыть дневник','web_app':{'url':values['APP_URL']}}})
call('setMyCommands',{'commands':[{'command':'start','description':'Открыть дневник здоровья'}]})
print('Configured @bpjournalbot menu and /start.')
