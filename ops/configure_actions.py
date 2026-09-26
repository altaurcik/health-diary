"""Provision GitHub delivery settings using existing credentials; never print secrets."""
import base64,json,subprocess,sys,urllib.request,urllib.error,ssl
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPO='altaurcik/health-diary'
p=subprocess.run(['/Library/Developer/CommandLineTools/usr/bin/git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,timeout=30)
credential=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
if not credential.get('password'): raise SystemExit('GitHub credential unavailable')
def api(path,method='GET',body=None):
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+path,method=method,headers={'Authorization':'Bearer '+credential['password'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=30,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem')) as response:
            raw=response.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error: raise SystemExit(f'GitHub {method} {path}: HTTP {error.code}') from None
if sys.argv[1:] == ['secret']:
    sys.path.insert(0,str(ROOT/'.cache/deploy'))
    from nacl.public import PublicKey,SealedBox
    public=api('/actions/secrets/public-key')
    encrypted=SealedBox(PublicKey(base64.b64decode(public['key']))).encrypt((ROOT/'secrets/deploy_key').read_bytes())
    api('/actions/secrets/DEPLOY_SSH_KEY','PUT',{'key_id':public['key_id'],'encrypted_value':base64.b64encode(encrypted).decode()})
    print('Encrypted DEPLOY_SSH_KEY configured.')
elif sys.argv[1:] == ['enable']:
    variables=api('/actions/variables')
    exists=any(v['name']=='DEPLOY_ENABLED' for v in variables['variables'])
    api('/actions/variables'+('/DEPLOY_ENABLED' if exists else ''),'PATCH' if exists else 'POST',{'name':'DEPLOY_ENABLED','value':'true'})
    api('/actions/workflows/delivery.yml/dispatches','POST',{'ref':'main'})
    print('Deployment enabled; main workflow dispatched.')
else: raise SystemExit('usage: configure_actions.py secret|enable')
