#!/usr/bin/python3
"""One-time root provisioning. Run only after approving production changes.
Inputs are an unpacked checkout and a root-only app.env supplied separately.
Application releases are installed exclusively through GitHub Actions.
"""
from pathlib import Path
import os, re, shutil, subprocess
ROOT=Path(__file__).resolve().parents[1]
def run(args,**kw):
    r=subprocess.run(args,check=True,text=True,capture_output=True,timeout=240,**kw)
    return r.stdout

def main():
    if os.geteuid()!=0: raise SystemExit('bootstrap requires root')
    env=Path('/etc/health-diary/app.env')
    if not env.exists() or env.stat().st_mode & 0o077: raise SystemExit('Provide root-only /etc/health-diary/app.env first.')
    public=Path('/etc/health-diary/deploy.pub').read_text().strip()
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]+)?',public): raise SystemExit('invalid deployment key')
    if not shutil.which('certbot'): run(['apt-get','update','-qq']);run(['apt-get','install','-y','--no-install-recommends','certbot'])
    for user,home,shell in [('health-diary','/opt/health-diary','/usr/sbin/nologin'),('health-deploy','/var/lib/health-deploy','/bin/sh')]:
        if subprocess.run(['id',user],capture_output=True).returncode: run(['useradd','--system','--create-home','--home',home,'--shell',shell,user])
    Path('/opt/health-diary').mkdir(exist_ok=True);os.chown('/opt/health-diary',0,0);os.chmod('/opt/health-diary',0o755)
    sql='''DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='health-diary') THEN CREATE ROLE "health-diary" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS health_diary AUTHORIZATION "health-diary";
GRANT CONNECT ON DATABASE survival_analytics TO "health-diary";'''
    run(['runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d','survival_analytics'],input=sql)
    ssh=Path('/var/lib/health-deploy/.ssh');ssh.mkdir(mode=0o700,exist_ok=True)
    auth=ssh/'authorized_keys';auth.write_text('restrict,command="sudo -n /usr/local/sbin/health-diary-deploy" '+public+'\n');auth.chmod(0o600)
    run(['chown','-R','health-deploy:health-deploy',str(ssh)])
    sudo=Path('/etc/sudoers.d/health-diary-deploy');sudo.write_text('health-deploy ALL=(root) NOPASSWD: /usr/local/sbin/health-diary-deploy\n');sudo.chmod(0o440)
    run(['visudo','-cf',str(sudo)])
    shutil.copyfile(ROOT/'ops/deploy_release.py','/usr/local/sbin/health-diary-deploy');os.chmod('/usr/local/sbin/health-diary-deploy',0o755)
    shutil.copyfile(ROOT/'ops/health-diary.service','/etc/systemd/system/health-diary.service')
    acme=Path('/var/www/health-diary-acme');acme.mkdir(parents=True,exist_ok=True)
    site=Path('/etc/nginx/sites-available/health-diary'); enabled=Path('/etc/nginx/sites-enabled/health-diary')
    if not site.exists():
        site.write_text('server { listen 80; server_name healthnote-bot.duckdns.org; location /.well-known/acme-challenge/ { root /var/www/health-diary-acme; } location / { return 302 https://healthnote-bot.duckdns.org:8443$request_uri; } }\n')
    if not enabled.exists(): enabled.symlink_to(site)
    run(['nginx','-t']);run(['systemctl','reload','nginx'])
    run(['certbot','certonly','--webroot','-w',str(acme),'-d','healthnote-bot.duckdns.org','--non-interactive','--agree-tos','--register-unsafely-without-email','--keep-until-expiring'])
    previous=site.read_text();site.write_text((ROOT/'ops/nginx.conf').read_text())
    try: run(['nginx','-t'])
    except Exception: site.write_text(previous);raise
    hook=Path('/etc/letsencrypt/renewal-hooks/deploy/health-diary-nginx');hook.parent.mkdir(parents=True,exist_ok=True);hook.write_text('#!/bin/sh\nnginx -t && systemctl reload nginx\n');hook.chmod(0o755)
    run(['systemctl','enable','--now','certbot.timer']);run(['systemctl','daemon-reload']);run(['systemctl','enable','health-diary'])
    run(['systemctl','reload','nginx'])
    if shutil.which('ufw') and 'Status: active' in run(['ufw','status']): run(['ufw','allow','8443/tcp'])
    print('BOOTSTRAP READY. Deploy the first release using GitHub Actions.')
if __name__=='__main__': main()
