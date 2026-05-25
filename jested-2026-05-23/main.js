import * as maptilersdk from '@maptiler/sdk'
import '@maptiler/sdk/dist/maptiler-sdk.css'

const KEY = 'CvOHpgtftkS6Whop2XWk'
maptilersdk.config.apiKey = KEY

// --- Styly ---
const STYLES = [
  { id: 'topo-v4',    label: '🗺 Topo' },
  { id: 'hybrid-v4',  label: '🛰 Hybrid' },
  { id: 'outdoor-v4', label: '🌲 Outdoor' },
]
let styleIdx = 0

const map = new maptilersdk.Map({
  container: 'map',
  style: `https://api.maptiler.com/maps/${STYLES[0].id}/style.json?key=${KEY}`,
  center: [15.0, 50.755],
  zoom: 11.5,
  pitch: 30,
  hash: true,
  projection: 'globe',
})

// --- Trasa ---
let routeGeoJSON = null
let routeCoords  = []
let minElev = 0, maxElev = 1

function addRouteLayers() {
  if (!routeGeoJSON || map.getSource('route')) return
  map.addSource('route', { type: 'geojson', data: routeGeoJSON })
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': 'rgba(255,255,255,0.7)', 'line-width': 5 }
  })
  map.addLayer({
    id: 'route-line', type: 'line', source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#f26522', 'line-width': 3 }
  })
}

map.on('style.load', () => {
  map.addSource('maptiler-terrain', {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,
    tileSize: 256
  })
  map.addLayer({
    id: 'sky', type: 'sky',
    paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0, 90], 'sky-atmosphere-sun-intensity': 15 }
  })
  map.setTerrain({ source: 'maptiler-terrain', exaggeration: 1.5 })
  addRouteLayers()
})

map.on('load', loadRoute)

async function loadRoute() {
  const res  = await fetch(`https://api.maptiler.com/data/019e5f0b-7292-78c9-9acb-7f2a80243b85/features.json?key=${KEY}`)
  routeGeoJSON = await res.json()

  for (const f of routeGeoJSON.features) {
    const segs = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]
    for (const seg of segs) routeCoords.push(...seg)
  }
  const elevs = routeCoords.map(c => c[2] ?? 0)
  minElev = Math.min(...elevs)
  maxElev = Math.max(...elevs)

  addRouteLayers()
  buildProfile()

  const el = document.createElement('img')
  el.src = import.meta.env.BASE_URL + 'runner.png'
  el.width = 52; el.height = 96
  el.style.display = 'none'
  el.style.borderRadius = '8px'
  el.style.filter = 'drop-shadow(1px 2px 4px rgba(0,0,0,0.6))'
  runnerMarker = new maptilersdk.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([routeCoords[0][0], routeCoords[0][1]])
    .addTo(map)

  document.getElementById('fly-btn').addEventListener('click', toggleFly)
}

// --- Přepínač stylů ---
const styleBtn = document.getElementById('style-btn')
styleBtn.textContent = STYLES[0].label
styleBtn.addEventListener('click', () => {
  styleIdx = (styleIdx + 1) % STYLES.length
  const s = STYLES[styleIdx]
  map.setStyle(`https://api.maptiler.com/maps/${s.id}/style.json?key=${KEY}`)
  styleBtn.textContent = s.label
})

// --- Flythrough ---
const DEG = Math.PI / 180
let smoothPitch = 0, smoothZoom = 11.5
let animFrame = null, startTime = null
let runnerMarker = null
const DURATION = 120_000

function toggleFly() {
  const btn = document.getElementById('fly-btn')
  if (animFrame) {
    cancelAnimationFrame(animFrame); animFrame = null; startTime = null
    btn.textContent = '▶ Průlet'; btn.classList.remove('active')
    runnerMarker.getElement().style.display = 'none'
    document.getElementById('profile').style.display = 'none'
    map.easeTo({ pitch: 0, duration: 600 })
    return
  }
  startTime = null
  btn.textContent = '◼ Stop'; btn.classList.add('active')
  runnerMarker.getElement().style.display = 'block'
  document.getElementById('profile').style.display = 'block'
  animFrame = requestAnimationFrame(step)
}

function step(ts) {
  if (!startTime) startTime = ts
  const progress = Math.min((ts - startTime) / DURATION, 1)
  const floatIdx = progress * (routeCoords.length - 1)
  const i = Math.floor(floatIdx), t = floatIdx - i

  const curr = routeCoords[i]
  const next = routeCoords[Math.min(i + 1, routeCoords.length - 1)]
  const lon = curr[0] + t * (next[0] - curr[0])
  const lat = curr[1] + t * (next[1] - curr[1])
  const ahead = routeCoords[Math.min(i + 30, routeCoords.length - 1)]

  const dLat = (ahead[1] - curr[1]) * 111320
  const dLon = (ahead[0] - curr[0]) * 111320 * Math.cos(curr[1] * DEG)
  const hDist = Math.sqrt(dLat * dLat + dLon * dLon) || 1
  const slopeDeg = Math.atan2((ahead[2] ?? 0) - (curr[2] ?? 0), hDist) / DEG
  const elevT = ((curr[2] ?? minElev) - minElev) / (maxElev - minElev)

  smoothPitch = smoothPitch * 0.92 + Math.max(15, Math.min(55, 30 + slopeDeg * 2.5)) * 0.08
  smoothZoom  = smoothZoom  * 0.92 + (16.5 - elevT * 1.2) * 0.08

  map.jumpTo({ center: [lon, lat], zoom: smoothZoom, bearing: bearing(curr, ahead), pitch: smoothPitch })
  runnerMarker.setLngLat([lon, lat])

  const ind = document.getElementById('profile-indicator')
  const x = (52 + progress * 1000).toFixed(1)
  ind.setAttribute('x1', x); ind.setAttribute('x2', x)

  if (progress < 1) {
    animFrame = requestAnimationFrame(step)
  } else {
    animFrame = null; startTime = null
    document.getElementById('fly-btn').textContent = '▶ Průlet'
    document.getElementById('fly-btn').classList.remove('active')
    runnerMarker.getElement().style.display = 'none'
    document.getElementById('profile').style.display = 'none'
  }
}

function bearing(a, b) {
  const r = d => d * DEG
  const dLon = r(b[0] - a[0])
  const lat1 = r(a[1]), lat2 = r(b[1])
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return Math.atan2(y, x) / DEG
}

// --- Profil výšky ---
function buildProfile() {
  const svg = document.getElementById('profile-svg')
  const W = 1000, H = 72, PAD = 52
  svg.setAttribute('viewBox', `0 0 ${W + PAD} ${H}`)

  const stride = Math.max(1, Math.floor(routeCoords.length / W))
  const elevs = []
  for (let i = 0; i < routeCoords.length; i += stride) elevs.push(routeCoords[i][2] ?? minElev)

  const scaleY = e => H - 6 - ((e - minElev) / (maxElev - minElev)) * (H - 14)
  const pts = elevs.map((e, i) => `${(PAD + i / (elevs.length - 1) * W).toFixed(1)},${scaleY(e).toFixed(1)}`)

  const ns = 'http://www.w3.org/2000/svg'
  const area = document.createElementNS(ns, 'path')
  area.setAttribute('d', `M${PAD},${H} L${pts.join(' L')} L${W + PAD},${H} Z`)
  area.setAttribute('fill', 'rgba(255,180,50,0.55)')
  svg.appendChild(area)

  const line = document.createElementNS(ns, 'path')
  line.setAttribute('d', `M${pts.join(' L')}`)
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke', 'rgba(255,210,80,0.9)')
  line.setAttribute('stroke-width', '1.5')
  svg.appendChild(line)

  for (const elev of [maxElev, (minElev + maxElev) / 2, minElev]) {
    const t = document.createElementNS(ns, 'text')
    t.setAttribute('x', PAD - 4)
    t.setAttribute('y', Math.max(10, Math.min(H - 2, scaleY(elev) + 4)).toFixed(1))
    t.setAttribute('text-anchor', 'end')
    t.setAttribute('fill', 'rgba(255,220,120,0.9)')
    t.setAttribute('font-size', '10')
    t.setAttribute('font-family', 'sans-serif')
    t.textContent = `${Math.round(elev)} m`
    svg.appendChild(t)
  }

  const ind = document.createElementNS(ns, 'line')
  ind.id = 'profile-indicator'
  ind.setAttribute('x1', PAD); ind.setAttribute('x2', PAD)
  ind.setAttribute('y1', 0);   ind.setAttribute('y2', H)
  ind.setAttribute('stroke', 'white')
  ind.setAttribute('stroke-width', '2')
  svg.appendChild(ind)
}
