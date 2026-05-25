import * as maptilersdk from '@maptiler/sdk'
import '@maptiler/sdk/dist/maptiler-sdk.css'

const KEY = 'CvOHpgtftkS6Whop2XWk'
maptilersdk.config.apiKey = KEY

const STYLES = {
  outdoor: `https://api.maptiler.com/maps/outdoor-v4/style.json?key=${KEY}`,
  hybrid:  `https://api.maptiler.com/maps/hybrid-v4/style.json?key=${KEY}`,
}
let activeStyle = 'outdoor'

const map = new maptilersdk.Map({
  container: 'map',
  style: STYLES.outdoor,
  center: [15.0, 50.755],
  zoom: 11.5,
  hash: true,
})

map.on('style.load', () => {
  map.addSource('route', {
    type: 'vector',
    url: `https://api.maptiler.com/data/019e5f0b-7292-78c9-9acb-7f2a80243b85/tiles.json?key=${KEY}`
  })
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    'source-layer': 'jested',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': 'rgba(255,255,255,0.7)', 'line-width': 5 }
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    'source-layer': 'jested',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#f26522', 'line-width': 3 }
  })
})

const btn = document.getElementById('style-btn')
btn.addEventListener('click', () => {
  activeStyle = activeStyle === 'outdoor' ? 'hybrid' : 'outdoor'
  map.setStyle(STYLES[activeStyle])
  btn.textContent = activeStyle === 'outdoor' ? '🛰 Satelit' : '🗺 Mapa'
})
