import * as maptilersdk from '@maptiler/sdk'
import '@maptiler/sdk/dist/maptiler-sdk.css'

const MAPTILER_KEY = 'CvOHpgtftkS6Whop2XWk'
const STYLE_ID = '019e5f0d-4dbb-7b9a-a52c-1ed7c62de155'

maptilersdk.config.apiKey = MAPTILER_KEY

const map = new maptilersdk.Map({
  container: 'map',
  style: `https://api.maptiler.com/maps/${STYLE_ID}/style.json?key=${MAPTILER_KEY}`,
  center: [14.99405, 50.71722],
  zoom: 12,
  pitch: 30,
  projection: 'globe'
})

map.on('load', () => {
  map.addSource('maptiler-terrain', {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
    tileSize: 256
  })

  map.addSource('maptiler-v3', {
    type: 'vector',
    url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`
  })

  map.addLayer({
    id: '3d-buildings',
    source: 'maptiler-v3',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#d4cfc8',
      'fill-extrusion-height': ['get', 'render_height'],
      'fill-extrusion-base': ['get', 'render_min_height'],
      'fill-extrusion-opacity': 0.75
    }
  })

  map.addLayer({
    id: 'sky',
    type: 'sky',
    paint: {
      'sky-type': 'atmosphere',
      'sky-atmosphere-sun': [0.0, 90.0],
      'sky-atmosphere-sun-intensity': 15
    }
  })

  map.setTerrain({ source: 'maptiler-terrain', exaggeration: 1.5 })
  loadRoute()
})

// --- Flythrough ---

const flyBtn = document.getElementById('fly-btn')
let routeCoords = []
let minElev = 0, maxElev = 1
let smoothPitch = 30, smoothZoom = 16
let animFrame = null
let startTime = null
const DURATION = 120_000

const DEG = Math.PI / 180
let runnerMarker = null

async function loadRoute() {
  const res = await fetch(`https://api.maptiler.com/data/019e5f0b-7292-78c9-9acb-7f2a80243b85/features.json?key=${MAPTILER_KEY}`)
  const data = await res.json()
  for (const feature of data.features) {
    const { type, coordinates } = feature.geometry
    const segments = type === 'MultiLineString' ? coordinates : [coordinates]
    for (const seg of segments) routeCoords.push(...seg)
  }
  const elevs = routeCoords.map(c => c[2] ?? 0)
  minElev = Math.min(...elevs)
  maxElev = Math.max(...elevs)

  buildProfile()

  const el = document.createElement('img')
  el.src = '/runner.png'
  el.width = 52
  el.height = 96
  el.style.display = 'none'
  el.style.borderRadius = '8px'
  el.style.filter = 'drop-shadow(1px 2px 4px rgba(0,0,0,0.6))'

  runnerMarker = new maptilersdk.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([routeCoords[0][0], routeCoords[0][1]])
    .addTo(map)

  flyBtn.addEventListener('click', toggleFly)
}

function buildProfile() {
  const svg = document.getElementById('profile-svg')
  const W = 1000, H = 72
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)

  const stride = Math.max(1, Math.floor(routeCoords.length / W))
  const elevs = []
  for (let i = 0; i < routeCoords.length; i += stride) elevs.push(routeCoords[i][2] ?? minElev)

  const scaleY = e => H - 6 - ((e - minElev) / (maxElev - minElev)) * (H - 14)
  const pts = elevs.map((e, i) => `${(i / (elevs.length - 1) * W).toFixed(1)},${scaleY(e).toFixed(1)}`)

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  area.setAttribute('d', `M0,${H} L${pts.join(' L')} L${W},${H} Z`)
  area.setAttribute('fill', 'rgba(255,180,50,0.55)')
  svg.appendChild(area)

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  line.setAttribute('d', `M${pts.join(' L')}`)
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke', 'rgba(255,210,80,0.9)')
  line.setAttribute('stroke-width', '1.5')
  svg.appendChild(line)

  const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  indicator.id = 'profile-indicator'
  indicator.setAttribute('x1', 0); indicator.setAttribute('x2', 0)
  indicator.setAttribute('y1', 0); indicator.setAttribute('y2', H)
  indicator.setAttribute('stroke', 'white')
  indicator.setAttribute('stroke-width', '2')
  svg.appendChild(indicator)
}

function toggleFly() {
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
    startTime = null
    flyBtn.textContent = '▶ Průlet'
    flyBtn.classList.remove('active')
    runnerMarker.getElement().style.display = 'none'
    document.getElementById('profile').style.display = 'none'
    return
  }
  startTime = null
  flyBtn.textContent = '◼ Stop'
  flyBtn.classList.add('active')
  runnerMarker.getElement().style.display = 'block'
  document.getElementById('profile').style.display = 'block'
  animFrame = requestAnimationFrame(step)
}

function step(ts) {
  if (!startTime) startTime = ts
  const progress = Math.min((ts - startTime) / DURATION, 1)
  const floatIdx = progress * (routeCoords.length - 1)
  const i = Math.floor(floatIdx)
  const t = floatIdx - i

  const curr = routeCoords[i]
  const next = routeCoords[Math.min(i + 1, routeCoords.length - 1)]
  const lon = curr[0] + t * (next[0] - curr[0])
  const lat = curr[1] + t * (next[1] - curr[1])

  const ahead = routeCoords[Math.min(i + 30, routeCoords.length - 1)]

  // slope → pitch
  const dLat = (ahead[1] - curr[1]) * 111320
  const dLon = (ahead[0] - curr[0]) * 111320 * Math.cos(curr[1] * DEG)
  const hDist = Math.sqrt(dLat * dLat + dLon * dLon) || 1
  const slopeDeg = Math.atan2((ahead[2] ?? 0) - (curr[2] ?? 0), hDist) / DEG
  const targetPitch = Math.max(15, Math.min(55, 30 + slopeDeg * 2.5))

  // elevation → zoom (nízko = přiblíž, vysoko = oddal)
  const elevT = ((curr[2] ?? minElev) - minElev) / (maxElev - minElev)
  const targetZoom = 16.5 - elevT * 1.2

  // exponenciální vyhlazení
  smoothPitch = smoothPitch * 0.92 + targetPitch * 0.08
  smoothZoom  = smoothZoom  * 0.92 + targetZoom  * 0.08

  map.jumpTo({ center: [lon, lat], zoom: smoothZoom, bearing: bearing(curr, ahead), pitch: smoothPitch })
  runnerMarker.setLngLat([lon, lat])

  const ind = document.getElementById('profile-indicator')
  const x = (progress * 1000).toFixed(1)
  ind.setAttribute('x1', x); ind.setAttribute('x2', x)

  if (progress < 1) {
    animFrame = requestAnimationFrame(step)
  } else {
    animFrame = null
    startTime = null
    flyBtn.textContent = '▶ Průlet'
    flyBtn.classList.remove('active')
    runnerMarker.getElement().style.display = 'none'
    document.getElementById('profile').style.display = 'none'
  }
}

function bearing(a, b) {
  const toRad = d => d * Math.PI / 180
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1]), lat2 = toRad(b[1])
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return Math.atan2(y, x) * 180 / Math.PI
}
