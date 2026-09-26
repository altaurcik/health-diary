#!/usr/bin/python3
"""Installed root-owned as /usr/local/sbin/health-diary-deploy by bootstrap.
Only accepts a bounded release archive on stdin; never accepts shell commands.
"""
import fcntl, io, json, os, re, subprocess, sys, tarfile, time, urllib.request
from pathlib import Path

def run(args,**kw): return subprocess.run(args,check=True,timeout=60,**kw)
def main():
    if os.geteuid()!=0: raise SystemExit('root wrapper required')
    with open('/run/lock/health-diary-deploy.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        payload=sys.stdin.buffer.read(20*1024*1024+1)
        if len(payload)>20*1024*1024: raise SystemExit('archive too large')
        with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as archive:
            members=archive.getmembers()
            allowed={'release.json','backend/model.py','backend/server.py','backend/schema.sql'}
            for member in members:
                path=Path(member.name)
                if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()): raise SystemExit('invalid archive path')
                if member.isfile() and member.name not in allowed and not member.name.startswith('frontend/dist/'): raise SystemExit('unexpected archive member')
            if sum(m.size for m in members)>50*1024*1024: raise SystemExit('unpacked release too large')
            sha=json.load(archive.extractfile('release.json'))['sha']
            if not re.fullmatch('[a-f0-9]{40}',sha): raise SystemExit('invalid commit')
            release=Path('/opt/health-diary/releases')/sha
            if release.exists(): raise SystemExit('release already installed; deploy a new commit or use an explicit rollback')
            release.mkdir(parents=True,mode=0o755)
            archive.extractall(release,filter='data')
        for path in release.rglob('*'): path.chmod(0o755 if path.is_dir() else 0o644)
        backups=Path('/var/backups/health-diary');backups.mkdir(mode=0o700,exist_ok=True)
        backup=backups/f'pre-{sha}.dump'
        with open(backup,'xb') as output:
            os.chmod(backup,0o600)
            run(['runuser','-u','health-diary','--','pg_dump','-d','survival_analytics','-n','health_diary','-Fc'],stdout=output)
        run(['runuser','-u','health-diary','--','psql','-X','-v','ON_ERROR_STOP=1','-d','survival_analytics','-f',str(release/'backend/schema.sql')],stdout=subprocess.DEVNULL)
        current=Path('/opt/health-diary/current'); previous=current.resolve() if current.is_symlink() else None
        temporary=Path('/opt/health-diary/current.next'); temporary.unlink(missing_ok=True); temporary.symlink_to(release);temporary.replace(current)
        try:
            run(['systemctl','restart','health-diary'])
            for attempt in range(15):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:8791/api/health',timeout=2) as response:
                        if json.load(response).get('ok'): break
                except Exception: time.sleep(1)
            else: raise RuntimeError('health check failed')
        except Exception:
            if previous:
                temporary.symlink_to(previous);temporary.replace(current);run(['systemctl','restart','health-diary'])
            else: run(['systemctl','stop','health-diary'])
            raise
        print('DEPLOYED',sha)
if __name__=='__main__': main()
