"""Replace public/sky/hosts.json with the full NASA Exoplanet Archive (about 6,000 stars).

    pip install requests
    python scripts/fetch_archive.py

Needs internet access. One planet per star is kept (the shortest period, which is
the easiest one to practise on). Methods the app does not teach yet are skipped.
"""
import csv, io, json, os, sys
import requests

URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
Q = ("select pl_name,hostname,ra,dec,sy_vmag,discoverymethod,pl_orbper,pl_rade,pl_bmasse,"
     "pl_orbsmax,sy_dist,st_mass,st_teff,disc_year from pscomppars")
METHOD = {"Transit": "transit", "Radial Velocity": "rv", "Imaging": "imaging",
          "Microlensing": "microlensing", "Astrometry": "astrometry"}

def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

r = requests.get(URL, params={"query": Q, "format": "csv"}, timeout=120)
r.raise_for_status()
best = {}
for row in csv.DictReader(io.StringIO(r.text)):
    meth = METHOD.get(row["discoverymethod"])
    ra, dec = num(row["ra"]), num(row["dec"])
    if not meth or ra is None or dec is None:
        continue
    per = num(row["pl_orbper"])
    mass_e = num(row["pl_bmasse"])
    dist_pc = num(row["sy_dist"])
    rec = dict(n=row["hostname"], ra=round(ra, 3), dec=round(dec, 3), m=num(row["sy_vmag"]), t=meth,
               pl=row["pl_name"].replace(row["hostname"], "").strip() or "b", p=per,
               r=num(row["pl_rade"]), mj=round(mass_e / 317.83, 4) if mass_e else None,
               a=num(row["pl_orbsmax"]), d=round(dist_pc * 3.2616, 1) if dist_pc else None,
               sm=num(row["st_mass"]), te=num(row["st_teff"]), y=int(num(row["disc_year"]) or 0))
    old = best.get(rec["n"])
    if old is None or (per and old["p"] and per < old["p"]):
        best[rec["n"]] = rec
out = sorted(best.values(), key=lambda x: x["n"])
os.makedirs("public/sky", exist_ok=True)
json.dump(out, open("public/sky/hosts.json", "w"), separators=(",", ":"))
print(len(out), "stars written to public/sky/hosts.json")
