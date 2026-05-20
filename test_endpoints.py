import urllib.request
import json
import urllib.error

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjb3pxcGR3b3h0d3Bzd21mZnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjYzNzQsImV4cCI6MjA5NDU0MjM3NH0.j7yaJ4YwBnp1nIpCquGxYvR3PIVxu_WrqMvln8IAhm4"
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

def check(url, name, extra_headers=None):
    h = headers.copy()
    if extra_headers: h.update(extra_headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            print(f"SUCCESS {name}: {len(data)} rows")
    except urllib.error.HTTPError as e:
        print(f"ERROR {name}: {e.code} - {e.read().decode('utf-8')}")

check("https://acozqpdwoxtwpswmffqz.supabase.co/rest/v1/matches?select=*", "Table 'matches'")
check("https://acozqpdwoxtwpswmffqz.supabase.co/rest/v1/WC26?select=*", "Table 'WC26'")
check("https://acozqpdwoxtwpswmffqz.supabase.co/rest/v1/matches?select=*", "Schema 'WC26', Table 'matches'", {"Accept-Profile": "WC26"})
check("https://acozqpdwoxtwpswmffqz.supabase.co/rest/v1/matches?select=*", "Schema 'wc26', Table 'matches'", {"Accept-Profile": "wc26"})
