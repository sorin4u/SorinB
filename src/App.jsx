import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import './App.css'

// Fix default marker icons under Vite/ESM
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
})

function App() {
  const [dbData, setDbData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const apiBase =
    import.meta.env.VITE_API_BASE_URL ||
    (window.location.protocol === 'file:' ? 'https://sorinb.onrender.com' : '')

  const [geoStatus, setGeoStatus] = useState('idle')
  const [geoError, setGeoError] = useState(null)
  const [position, setPosition] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [saveError, setSaveError] = useState(null)
  const [tracking, setTracking] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const trackTimerRef = useRef(null)
  const watchIdRef = useRef(null)
  const latestPositionRef = useRef(null)
  const wakeLockRef = useRef(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${apiBase}/api/data`)
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`HTTP ${response.status} ${response.statusText} ${text}`)
        }
        return response.json()
      })
      .then((data) => {
        setDbData(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [apiBase])

  useEffect(() => {
    // Fetch data from database on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const stopTracking = useCallback(() => {
    if (trackTimerRef.current) {
      window.clearInterval(trackTimerRef.current)
      trackTimerRef.current = null
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch?.(watchIdRef.current)
      watchIdRef.current = null
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release?.().catch(() => {})
      wakeLockRef.current = null
    }
    setTracking(false)
    setGeoStatus('idle')
  }, [])

  useEffect(() => {
    return () => {
      if (trackTimerRef.current) {
        window.clearInterval(trackTimerRef.current)
        trackTimerRef.current = null
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch?.(watchIdRef.current)
        watchIdRef.current = null
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {})
        wakeLockRef.current = null
      }
    }
  }, [])

  const saveLocationToDb = useCallback(
    (nextPosition) => {
      // Save to DB
      setSaveStatus('saving')
      fetch(`${apiBase}/api/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: nextPosition.lat,
          lng: nextPosition.lng,
          altitude: nextPosition.altitude,
          accuracy: nextPosition.accuracy,
          altitudeAccuracy: nextPosition.altitudeAccuracy,
          heading: nextPosition.heading,
          speed: nextPosition.speed,
          timestamp: nextPosition.timestamp,
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const text = await r.text().catch(() => '')
            throw new Error(`Save failed: HTTP ${r.status} ${r.statusText} ${text}`)
          }
          return r.json()
        })
        .then(() => {
          setSaveStatus('saved')
          setLastSavedAt(new Date())
        })
        .catch((e) => {
          setSaveStatus('error')
          setSaveError(e.message)
        })
    },
    [apiBase],
  )

  const ensureGeolocationAvailable = useCallback(() => {
    setGeoError(null)

    if (!('geolocation' in navigator)) {
      setGeoStatus('error')
      setGeoError('Geolocation is not supported in this browser.')
      return false
    }

    // Most browsers require a secure context for geolocation (HTTPS or localhost).
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setGeoStatus('error')
      const isInIframe = window.top !== window
      const message =
        `Geolocation is blocked because this page is not in a secure context.\n\n` +
        `Fix: open the app on HTTPS (or use http://localhost).` +
        (isInIframe
          ? `\n\nIf this app is inside an iframe, the page that contains the iframe must ALSO be HTTPS.`
          : '') +
        `\n\nCurrent frame: ${window.location.protocol}//${window.location.host}`
      setGeoError(message)
      window.alert(message)
      return false
    }

    return true
  }, [])

  const captureOnce = useCallback(() => {
    if (!ensureGeolocationAvailable()) return

    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSaveStatus('idle')
        setSaveError(null)

        const nextPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        }

        setPosition(nextPosition)
        latestPositionRef.current = nextPosition
        setGeoStatus('ready')

        saveLocationToDb(nextPosition)
      },
      (err) => {
        let message = err?.message || 'Unable to get your location.'
        if (err?.code === 1)
          message =
            'Permission denied. Fix: click the lock icon in the address bar → Site settings → Location → Allow. Then reload and try again.'
        if (err?.code === 2) message = 'Position unavailable. Try again or check your device settings.'
        if (err?.code === 3) message = 'Location request timed out. Try again.'
        setGeoError(message)
        setGeoStatus('error')

        if (err?.code === 1) {
          window.alert(message)
          stopTracking()
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      },
    )
  }, [ensureGeolocationAvailable, saveLocationToDb, stopTracking])

  const startWatch = useCallback(() => {
    if (!ensureGeolocationAvailable()) return

    // Best-effort: keep screen awake while tracking
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockRef.current = lock
        })
        .catch(() => {})
    }

    setGeoStatus('loading')

    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch?.(watchIdRef.current)
      watchIdRef.current = null
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const nextPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        }
        latestPositionRef.current = nextPosition
        setPosition(nextPosition)
        setGeoStatus('ready')
      },
      (err) => {
        let message = err?.message || 'Unable to get your location.'
        if (err?.code === 1)
          message =
            'Permission denied. Fix: click the lock icon in the address bar → Site settings → Location → Allow. Then reload and try again.'
        if (err?.code === 2) message = 'Position unavailable. Try again or check your device settings.'
        if (err?.code === 3) message = 'Location request timed out. Try again.'
        setGeoError(message)
        setGeoStatus('error')
        if (err?.code === 1) {
          window.alert(message)
          stopTracking()
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      },
    )
  }, [ensureGeolocationAvailable, stopTracking])

  const toggleTracking = useCallback(() => {
    if (tracking) {
      stopTracking()
      return
    }

    const ok = window.confirm('Allow this app to use your current location every 1 minute and save it to the database?')
    if (!ok) return

    setTracking(true)
    startWatch()
    captureOnce() // save immediately on start
    trackTimerRef.current = window.setInterval(() => {
      const latest = latestPositionRef.current
      if (latest) {
        saveLocationToDb(latest)
      } else {
        captureOnce()
      }
    }, 60_000)
  }, [tracking, stopTracking, startWatch, captureOnce, saveLocationToDb])

  // If the page becomes visible again, re-request wake lock (best-effort)
  useEffect(() => {
    if (!tracking) return

    const onVisibility = () => {
      if (!tracking) return
      if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        navigator.wakeLock
          .request('screen')
          .then((lock) => {
            wakeLockRef.current = lock
          })
          .catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [tracking])

  const mapCenter = useMemo(() => {
    if (position) return [position.lat, position.lng]
    // Default: Bucharest (nice fallback for first load)
    return [44.4268, 26.1025]
  }, [position])

  const rows = Array.isArray(dbData?.data) ? dbData.data : []
  const columns = rows.length > 0 && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []

  return (
    <main className="page">
      <header className="pageHeader">
        <div className="titleBlock">
          <h1>All Database Data</h1>
          <p className="subtitle">API base: {apiBase || '(same-origin)'}</p>
        </div>

        <div className="actions">
          <button className="btn" onClick={fetchData}>
            Refresh
          </button>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="sectionHeader">
          <h2>Map</h2>
          <div className="actions">
            <button className="btn" onClick={toggleTracking} disabled={geoStatus === 'loading'}>
              {geoStatus === 'loading'
                ? 'Getting location…'
                : tracking
                  ? 'Stop tracking'
                  : 'Use my location'}
            </button>
          </div>
        </div>

        {geoError && <p className="status error">{geoError}</p>}

        {saveError && <p className="status error">{saveError}</p>}

        {saveStatus === 'saving' && <p className="status">Saving location to database…</p>}
        {saveStatus === 'saved' && <p className="status">Saved location to database ✅</p>}
        {tracking && <p className="status">Tracking is ON (saves every 1 minute, best-effort in background)</p>}
        {!tracking && lastSavedAt && <p className="muted">Last saved: {lastSavedAt.toLocaleString()}</p>}

        {position && (
          <p className="muted" style={{ marginBottom: 10 }}>
            Lat: {position.lat.toFixed(6)} · Lng: {position.lng.toFixed(6)} · Accuracy: ~{Math.round(position.accuracy)}m
          </p>
        )}

        <div className="mapWrap" role="region" aria-label="Map">
          <MapContainer center={mapCenter} zoom={position ? 15 : 11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {position && (
              <Marker position={[position.lat, position.lng]}>
                <Popup>
                  You are here<br />
                  ({position.lat.toFixed(5)}, {position.lng.toFixed(5)})
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Note: Location works only on HTTPS (or localhost).
        </p>
      </section>

      <section className="card">
        {loading && <p className="status">Loading all data from database…</p>}
        {error && <p className="status error">Error: {error}</p>}

        {dbData && (
          <>
            <div className="sectionHeader">
              <h2>Data</h2>
              <p className="muted">Total rows: {rows.length}</p>
            </div>

            <div className="tableWrap" role="region" aria-label="Database table" tabIndex={0}>
              <table className="dataTable">
                {columns.length > 0 && (
                  <thead>
                    <tr>
                      {columns.map((key) => (
                        <th key={key} scope="col">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}

                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {(columns.length ? columns : Object.keys(row)).map((colKey) => (
                        <td key={colKey}>{row?.[colKey]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default App


