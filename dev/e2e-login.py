#!/usr/bin/env python3
"""Headless E2E: Keycloak PKCE login (client windband-inventory) -> WM /api/v1/me/bands.
Redirects are captured (no :5173 server needed) instead of followed."""
import base64, hashlib, json, re, secrets, urllib.parse, urllib.request, urllib.error, http.cookiejar, html as htmllib

KC = "http://localhost:8180/realms/windband"
CLIENT = "windband-inventory"
REDIRECT = "http://localhost:5173/callback"

def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")

class CapturedRedirect(Exception):
    def __init__(self, location: str):
        self.location = location

class NoFollow(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None

    def http_error_302(self, req, fp, code, msg, headers):  # type: ignore[override]
        loc = htmllib.unescape(headers.get("Location") or "")
        raise CapturedRedirect(loc)

    http_error_301 = http_error_302  # type: ignore[assignment]

class Ctx:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cj), NoFollow())

    def get(self, url: str, hops: int = 10) -> tuple[str, str]:
        """GET following redirects manually; returns (final_url, body_html)."""
        cur = url
        for _ in range(hops):
            try:
                with self.op.open(urllib.request.Request(cur)) as r:
                    return r.geturl(), r.read().decode("utf-8", "replace")
            except CapturedRedirect as cr:
                cur = urllib.parse.urljoin(url, cr.location)
                # Authorization-code handoff lands on the SPA redirect_uri — nothing to
                # fetch there in a headless run (no dev server); hand the URL back as-is.
                pu = urllib.parse.urlparse(cur)
                ru = urllib.parse.urlparse(REDIRECT)
                if pu.scheme == ru.scheme and pu.netloc == ru.netloc and "code=" in pu.query:
                    return cur, ""
        raise RuntimeError(f"redirect loop at {cur}")

    def post(self, url: str, fields: dict) -> tuple[str, str]:
        body = urllib.parse.urlencode(fields).encode()
        req = urllib.request.Request(url, data=body,
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            with self.op.open(req) as r:
                return r.geturl(), r.read().decode("utf-8", "replace")
        except CapturedRedirect as cr:
            return cr.location, ""

def do_login(username: str, password: str, ctx: Ctx) -> dict:
    verifier = b64u(secrets.token_bytes(32))
    challenge = b64u(hashlib.sha256(verifier.encode()).digest())
    state = b64u(secrets.token_bytes(12))
    auth_url = KC + "/protocol/openid-connect/auth?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": CLIENT, "redirect_uri": REDIRECT,
        "scope": "openid profile email", "state": state, "nonce": "abc123nonce",
        "code_challenge": challenge, "code_challenge_method": "S256",
    })

    final_url, html = ctx.get(auth_url)
    code = None

    ufinal = urllib.parse.urlparse(final_url)
    if "login-actions" not in ufinal.path:
        direct = urllib.parse.parse_qs(ufinal.query).get("code")
        if direct:
            code = direct[0]  # SSO fast path (existing KC session)

    if not code:
        mform = re.search(r'(?s)<form[^>]+action="([^"]+)"', html)
        assert mform, f"no login form; final={final_url}; html[:300]={html[:300]}"
        action = htmllib.unescape(mform.group(1))
        loc, _body = ctx.post(action, {"username": username, "password": password})

        # The login may chain through required actions (VERIFY_PROFILE etc.) —
        # walk the chain until we hit the callback with the code.
        for _ in range(6):
            uloc = urllib.parse.urlparse(loc)
            qcode = urllib.parse.parse_qs(uloc.query).get("code")
            if qcode:
                code = qcode[0]
                break
            if "login-actions" in uloc.path or loc.startswith(KC + "/protocol/openid-connect/auth"):
                # a follow-on page; if it has a form, submit it (required action)
                with ctx.op.open(urllib.request.Request(loc)) as r:
                    page = r.read().decode("utf-8", "replace")
                m2 = re.search(r'(?s)<form[^>]+action="([^"]+)"', page)
                if not m2:
                    break  # unexpected terminal page without form/code
                fields = {"username": username, "password": password}
                for hf in ("submit",):
                    if re.search(r'name="%s"' % hf, page):
                        pass  # value not required by KC's action forms
                loc, _ = ctx.post(htmllib.unescape(m2.group(1)), fields)
            else:
                break

    assert code, f"no auth code obtained (last={loc if 'loc' in dir() else final_url})"
    return exchange(code, verifier)

def exchange(code: str, verifier: str) -> dict:
    body = urllib.parse.urlencode({
        "grant_type": "authorization_code", "code": code, "code_verifier": verifier,
        "client_id": CLIENT, "redirect_uri": REDIRECT,
    }).encode()
    req = urllib.request.Request(KC + "/protocol/openid-connect/token", data=body,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def wm_api(token: str, path: str):
    req = urllib.request.Request("http://localhost:8080" + path, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def run_case(user, pwd, expect_status=200):
    print(f"\n=== {user} ===")
    toks = do_login(user, pwd, Ctx())  # fresh browser context per user: isolates KC SSO sessions
    payload_b64 = toks["id_token"].split(".")[1]
    pad = "=" * (-len(payload_b64) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload_b64 + pad).decode())
    print("preferred_username:", claims.get("preferred_username"), "email:", claims.get("email"))
    st, body = wm_api(toks["access_token"], "/api/v1/me/bands")
    print("WM /me/bands:", st, json.dumps(body, ensure_ascii=False))
    assert st == expect_status, f"{user}: expected {expect_status}, got {st}"
    if expect_status == 200:
        names = {b["name"] for b in body}
        return names, {str(b["bandId"]): b for b in body}
    return None, None

alice_names, alice_map = run_case("inv-alice", "Test-2026!")
assert {"MOD Strażak", "Wielka Orkiestra Tęsknoty"} <= alice_names, \
    f"alice must see both her bands, saw: {alice_names}"
mo = [b for b in alice_map.values() if b["name"] == "MOD Strażak"][0]
wo = [b for b in alice_map.values() if b["name"] == "Wielka Orkiestra Tęsknoty"][0]
assert mo["role"] == "ADMIN", f"alice ADMIN on MOD Strażak, got {mo['role']}"
assert wo["role"] == "MEMBER", f"alice MEMBER on WOT, got {wo['role']}"

bob_names, _bob_map = run_case("inv-bob", "Test-2026!")
assert bob_names == {"Wielka Orkiestra Tęsknoty"}, \
    f"ISOLATION FAIL — bob must see exactly his band, saw: {bob_names}"
assert "MOD Strażak" not in bob_names, "ISOLATION FAIL — alice's band leaked to bob"

admin_names, admin_map = run_case("admin", "Test-2026!")
assert {"MOD Strażak"} == admin_names, f"admin should see just MOD Strażak, saw: {admin_names}"
assert [b for b in admin_map.values() if b["name"] == "MOD Strażak"][0]["role"] == "ADMIN"

run_case("inv-eve", "Test-2026!", expect_status=403)  # authenticated in KC, no WM profile → B8 rule
print("\nALL E2E ASSERTIONS PASSED")