# ධීවර මිතුරා (DheewaraMithura)

ධීවරයන් සඳහා මුහුදු කාලගුණය, මුහුදු යාමේ ආරක්ෂාව සහ මාළු සිටිය හැකි කලාප පෙන්වන web app එක (PWA).

## GitHub Pages වෙත දැමීම
1. GitHub හි **DheewaraMithura** නමින් repo එකක් හදන්න (manifest `id` = `/DheewaraMithura/` — නම වෙනස් කරනවා නම් `manifest.json` හි `id` ද එයට ගැලපෙන්න වෙනස් කරන්න).
2. මෙම folder එකේ සියලු ගොනු (icons folder එකත් සමග) upload කරන්න.
3. Settings → Pages → Branch: `main` / root → Save.
4. විවෘත කරන්න: `https://udithapana.github.io/DheewaraMithura/`

## ගොනු
- `index.html`, `style.css` — අතුරුමුහුණත
- `calc.js` — මාළු කලාප ලකුණු, දුර/දිශාව, ආරක්ෂක මට්ටම්, සඳ කලාව
- `app.js` — දත්ත ලබාගැනීම, සිතියම, ටැබ
- `sw.js` — offline (caches: `dheewara-mithura-*` පමණි)
- `manifest.json`, `icons/` — ස්ථාපනය (any + maskable වෙන වෙනම)

## දත්ත මූලාශ්‍ර (API key අවශ්‍ය නැත)
- Open-Meteo Forecast + Marine API — සුළඟ, වැසි, රළ, ධාරා
- NOAA CoastWatch ERDDAP — `jplMURSST41` (SST), `nesdisVHNnoaaSNPPnoaa20NRTchlaGapfilledDaily` (chlorophyll)
- MUR ලබාගත නොහැකි වුවහොත් Open-Meteo SST (0.5°) භාවිතා කරයි.

## localStorage
සියලු keys `dheewaraMithura_` ආරම්භයෙන් — `localStorage.clear()` භාවිතා නොකරයි.
