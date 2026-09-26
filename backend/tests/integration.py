"""Runs only against the disposable GitHub Actions PostgreSQL service."""
import json, os, sys, threading, unittest, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).parents[1]))
dsn=os.environ.get('TEST_DATABASE_DSN','')
if not dsn.endswith('/health_diary_ci'): raise SystemExit('Use the disposable health_diary_ci database only.')
os.environ.update(DATABASE_DSN=dsn,BOT_TOKEN='test-only-token',SESSION_SECRET='test-session-secret',APP_URL='https://example.invalid')
import psycopg2
import server
from model import session_token

class Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with server.db() as conn,conn.cursor() as cur:
            cur.execute('CREATE SCHEMA health_diary')
            cur.execute((Path(__file__).parents[1]/'schema.sql').read_text())
            cur.execute('INSERT INTO health_diary.users(telegram_id) VALUES(123),(456)')
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.address=f'http://127.0.0.1:{cls.http.server_port}'
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.http.shutdown(); cls.http.server_close()
    def call(self,user,method='GET',body=None,path='/api/state'):
        token=session_token(user,server.SECRET) if user else 'bad'
        request=urllib.request.Request(self.address+path,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(request) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as response: return response.code,json.load(response)
    def test_authentication_and_isolation(self):
        self.assertEqual(self.call(None)[0],401)
        self.assertEqual(self.call(123)[1]['state'],None)
        state={'version':2,'profile':{'timezone':'UTC','theme':'dark','sex':'','height':'','birthDate':''},'records':[],'schedules':[],'reminderActions':{}}
        self.assertEqual(self.call(123,'PUT',{'state':state,'revision':0})[0],200)
        self.assertEqual(self.call(456)[1]['state'],None)
        self.assertEqual(self.call(123)[1]['state'],state)
        with ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _: self.call(123,'PUT',{'state':state,'revision':1})[0],range(2)))
        self.assertEqual(sorted(results),[200,409])
        self.assertEqual(self.call(123,'PUT',{'state':{},'revision':2})[0],400)
        self.assertEqual(self.call(123)[1]['revision'],2)
        self.assertEqual(self.call(456)[1]['revision'],0)
        self.assertEqual(self.call(None,'POST',{'initData':'invalid'},'/api/auth')[0],401)
    def test_delivery_claim_is_unique(self):
        with server.db() as conn,conn.cursor() as cur:
            for _ in range(2): cur.execute("INSERT INTO health_diary.deliveries(telegram_id,delivery_key,status) VALUES(456,'synthetic','sending') ON CONFLICT DO NOTHING")
            cur.execute("SELECT count(*) FROM health_diary.deliveries WHERE telegram_id=456 AND delivery_key='synthetic'")
            self.assertEqual(cur.fetchone()[0],1)
if __name__=='__main__': unittest.main()
