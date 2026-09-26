import subprocess, socket, importlib.util, shutil, json

def run(args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=30)
    print(json.dumps({'command': args, 'code': result.returncode, 'output': result.stdout[:12000], 'error': result.stderr[:500]}, ensure_ascii=False))
run(['cat','/etc/os-release'])
run(['ss','-ltnp'])
run(['df','-h','/'])
run(['free','-m'])
run(['systemctl','is-active','nginx','postgresql@16-main','x-ui','ermias-support-bot','roblox-discovery-api'])
run(['runuser','-u','postgres','--','psql','-X','-d','survival_analytics','-Atc',"SELECT datname FROM pg_database WHERE NOT datistemplate; SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%';"])
for name in ['fastapi','uvicorn','psycopg','psycopg2','httpx']:
    print(name, bool(importlib.util.find_spec(name)))
for name in ['certbot','openssl','python3']:
    print(name, shutil.which(name))
print('domain_ips', sorted({x[4][0] for x in socket.getaddrinfo('healthnote-bot.duckdns.org', None)}))
run(['ls','/etc/nginx/sites-enabled'])
