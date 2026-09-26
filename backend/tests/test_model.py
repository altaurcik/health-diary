import unittest, sys, json, hashlib, hmac
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode
sys.path.insert(0,str(Path(__file__).parents[1]))
from model import *

TOKEN='test-only-token'
def signed(user=123, stamp=10000):
    data={'user':json.dumps({'id':user}), 'auth_date':str(stamp)}
    check='\n'.join(f'{k}={v}' for k,v in sorted(data.items()))
    data['hash']=hmac.new(hmac.new(b'WebAppData',TOKEN.encode(),hashlib.sha256).digest(),check.encode(),hashlib.sha256).hexdigest()
    return urlencode(data)
def state():
    return {'version':2,'profile':{'timezone':'Europe/Moscow','theme':'dark','sex':'','height':'','birthDate':''},'records':[], 'schedules':[{'id':'a','kind':'all','enabled':True,'frequency':'weekly','time':'08:00','days':[0,1,2,3,4,5,6]}], 'reminderActions':{}}
class Tests(unittest.TestCase):
    def test_signed_identity(self):
        self.assertEqual(telegram_user(signed(),TOKEN,10001)['id'],123)
        for raw in [signed().replace('123','124'),signed()+'&user=123',signed(stamp=1),signed(stamp=200000)]:
            with self.assertRaises((Invalid,ValueError)): telegram_user(raw,TOKEN,100000)
    def test_session(self):
        token=session_token(123,'secret',10000)
        self.assertEqual(session_user(token,'secret',10001),123)
        for bad,secret,now in [(token.replace('123','124'),'secret',10001),(token,'bad',10001),(token,'secret',100000),('abc','secret',10001)]:
            with self.assertRaises(Invalid): session_user(bad,secret,now)
    def test_validation(self):
        self.assertEqual(validate_state(state()),state())
        for field,value in [('timezone','bad'),('height',1000),('theme','bad')]:
            row=state();row['profile'][field]=value
            with self.assertRaises(Invalid): validate_state(row)
        row=state();row['schedules'][0]['days']=[]
        with self.assertRaises(Invalid): validate_state(row)
    def test_pressure(self):
        row=state();row['records']=[{'id':'r','kind':'bp','at':'2026-03-01T08:00:00Z','systolic':125,'diastolic':80,'comment':'test'}]
        validate_state(row)
        row['records'][0]['diastolic']=140
        with self.assertRaises(Invalid): validate_state(row)
    def test_all_and_completion(self):
        row=state();now=datetime(2026,9,26,5,0,tzinfo=timezone.utc)
        events=list(due_alarms(row,now));self.assertEqual([e['kind'] for e in events],['bp','weight'])
        row['reminderActions'][events[0]['key']]='done'
        self.assertEqual([e['kind'] for e in due_alarms(row,now)],['weight'])
    def test_disabled_and_historical(self):
        row=state();now=datetime(2026,9,26,12,0,tzinfo=timezone.utc)
        self.assertEqual(list(due_alarms(row,now)),[])
        row['schedules'][0]['enabled']=False
        self.assertEqual(list(due_alarms(row,now.replace(hour=5))),[])
    def test_midnight_snooze(self):
        row=state();row['schedules'][0]['time']='23:50'
        now=datetime(2026,9,26,21,10,tzinfo=timezone.utc)
        row['reminderActions']['a:2026-09-26:23:50:bp']=now.timestamp()*1000
        self.assertEqual([e['kind'] for e in due_alarms(row,now)],['bp'])
    def test_dst_gap(self):
        row=state();row['profile']['timezone']='America/New_York';row['schedules'][0]['time']='02:30'
        self.assertEqual(list(due_alarms(row,datetime(2026,3,8,7,30,tzinfo=timezone.utc))),[])
if __name__=='__main__': unittest.main()
