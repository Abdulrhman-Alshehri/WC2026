import urllib.request
import json

url = "https://acozqpdwoxtwpswmffqz.supabase.co/rest/v1/matches?select=*"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjb3pxcGR3b3h0d3Bzd21mZnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjYzNzQsImV4cCI6MjA5NDU0MjM3NH0.j7yaJ4YwBnp1nIpCquGxYvR3PIVxu_WrqMvln8IAhm4"

req = urllib.request.Request(url, headers={
    "apikey": key,
    "Authorization": f"Bearer {key}"
})

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        france_germany = [m for m in data if m['home_team'] == 'France' and m['away_team'] == 'Germany']
        print(f"France vs Germany matches found: {len(france_germany)}")
        if france_germany:
            print(france_germany)
except Exception as e:
    print(f"Error: {e}")
