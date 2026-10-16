"""Drive the real local-only CLI via a PTY. Never emit its sensitive transcript."""
import json
import os
import pty
import re
import secrets
import select
import subprocess
import time
import urllib.parse


def run(recover=False, duplicate=False):
    master, slave = pty.openpty()
    args = [os.environ['WMS_NODE'], '--conditions=source', '--import', 'tsx',
            'scripts/auth-bootstrap.ts', '--test'] + (['--recover'] if recover else [])
    child = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, env=os.environ)
    os.close(slave)
    transcript = b''
    password = secrets.token_urlsafe(24)
    def until(marker):
        nonlocal transcript
        deadline = time.monotonic() + 12
        while marker.encode() not in transcript:
            if time.monotonic() > deadline: raise RuntimeError('CLI_PROMPT_TIMEOUT')
            if select.select([master], [], [], .2)[0]:
                try: data = os.read(master, 4096)
                except OSError: break
                if not data: break
                transcript += data
        if marker.encode() not in transcript: raise RuntimeError('CLI_PROMPT_MISSING')
    def send(value): os.write(master, value.encode()+b'\r')
    try:
        if duplicate:
            child.wait(timeout=12)
            return {'exit':child.returncode}
        until('Login ID:'); send('cli-administrator')
        until('Display name:'); send('Synthetic CLI Administrator')
        until('hidden):'); send(password)
        until('Repeat password (hidden):'); send(password)
        until('Current six-digit TOTP:')
        uri = re.search(rb'otpauth://[^\r\n\x1b ]+', transcript).group().decode()
        secret = urllib.parse.parse_qs(urllib.parse.urlparse(uri).query)['secret'][0]
        code = subprocess.check_output([os.environ['WMS_NODE'], '--conditions=source', '--import', 'tsx',
            '--input-type=module', '-e', 'import {totpCode} from "./apps/api/src/auth/crypto.ts"; process.stdout.write(totpCode(process.env.WMS_TEST_OTP));'],
            env={**os.environ, 'WMS_TEST_OTP':secret}, text=True)
        send(code)
        until('cannot be retrieved again:')
        child.wait(timeout=12)
        while select.select([master], [], [], .1)[0]:
            try: data=os.read(master,4096)
            except OSError: break
            if not data: break
            transcript+=data
        return {'exit':child.returncode, 'passwordEchoed':password.encode() in transcript,
                'codes':len(re.findall(rb'(?m)^[a-f0-9]{32}\r?$', transcript))}
    finally:
        if child.poll() is None: child.kill(); child.wait()
        os.close(master)

print(json.dumps({'bootstrap':run(), 'duplicate':run(duplicate=True), 'recovery':run(recover=True)}))
