"""Read-only GitHub API via the existing git credential helper. Never prints credentials."""
import json, subprocess, urllib.request, urllib.error, ssl
REPO='altaurcik/health-diary'
p=subprocess.run(['/Library/Developer/CommandLineTools/usr/bin/git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,timeout=30)
credential=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
if not credential.get('password'): raise SystemExit('GitHub credential unavailable')
request=urllib.request.Request(f'https://api.github.com/repos/{REPO}/actions/runs?per_page=3',headers={'Authorization':'Bearer '+credential['password'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
try:
    with urllib.request.urlopen(request,timeout=20,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem')) as response: result=json.load(response)
except urllib.error.HTTPError as error: raise SystemExit(f'GitHub API HTTP {error.code}') from None
print(json.dumps([{'id':r['id'],'sha':r['head_sha'],'status':r['status'],'conclusion':r['conclusion'],'url':r['html_url']} for r in result['workflow_runs']]))
