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
  const [authUser, setAuthUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem('sorinb_token') || '')

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

  const getAuthHeaders = useCallback(() => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {}
  }, [authToken])

  const fetchMe = useCallback(() => {
    setAuthLoading(true)
    setAuthError(null)
    fetch(`${apiBase}/api/auth/me`, {
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
      },
    })
      .then(async (r) => {
        if (r.status === 401) return null
        if (!r.ok) {
          const text = await r.text().catch(() => '')
          throw new Error(`Session check failed: HTTP ${r.status} ${r.statusText} ${text}`)
        }
        return r.json()
      })
      .then((data) => {
        setAuthUser(data?.user || null)
        setAuthLoading(false)
      })
      .catch((e) => {
        setAuthError(e.message)
        setAuthUser(null)
        setAuthLoading(false)
      })
  }, [apiBase, getAuthHeaders])

  const logout = useCallback(() => {
    fetch(`${apiBase}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
      },
    })
      .catch(() => {})
      .finally(() => {
        setAuthUser(null)
        setDbData(null)
        setAuthToken('')
        window.localStorage.removeItem('sorinb_token')
      })
  }, [apiBase, getAuthHeaders])

  const submitAuth = useCallback(
    (e) => {
      e.preventDefault()
      setAuthError(null)
      const url = authMode === 'register' ? '/api/auth/register' : '/api/auth/login'

      fetch(`${apiBase}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => null)
          if (!r.ok) throw new Error(data?.error || `Auth failed: HTTP ${r.status}`)
          return data
        })
        .then((data) => {
          setAuthUser(data?.user || null)
          const token = typeof data?.token === 'string' ? data.token : ''
          if (token) {
            setAuthToken(token)
            window.localStorage.setItem('sorinb_token', token)
          }
          setPassword('')
        })
        .catch((err) => setAuthError(err.message))
    },
    [apiBase, authMode, email, password],
  )

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${apiBase}/api/data`, {
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
      },
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Not authorized (admin only).')
        }
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
  }, [apiBase, getAuthHeaders])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMe()
  }, [fetchMe])

  useEffect(() => {
    if (authUser?.role === 'admin') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData()
    } else {
      setLoading(false)
      setDbData(null)
    }
  }, [authUser, fetchData])

  const stopTracking = useCallback(() => {
    if (trackTimerRef.current) {
      window.clearInterval(trackTimerRef.current)
      trackTimerRef.current = null
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
    }
  }, [])

  const captureAndSaveLocation = useCallback(() => {
    setGeoError(null)

    if (!('geolocation' in navigator)) {
      setGeoStatus('error')
      setGeoError('Geolocation is not supported in this browser.')
      return
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
      return
    }

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
        setGeoStatus('ready')

        // Save to DB
        setSaveStatus('saving')
        fetch(`${apiBase}/api/locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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
          // Also send Bearer token for setups where cookies are blocked
          // (e.g., cross-domain or strict mobile cookie settings).
          ...(authToken
            ? {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${authToken}`,
                },
              }
            : {}),
        })
          .then(async (r) => {
            if (r.status === 401) {
              throw new Error('Please login first to save locations.')
            }
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
  }, [apiBase, authToken, stopTracking])

  const toggleTracking = useCallback(() => {
    if (tracking) {
      stopTracking()
      return
    }

    const ok = window.confirm('Allow this app to use your current location every 1 minute and save it to the database?')
    if (!ok) return

    setTracking(true)
    captureAndSaveLocation() // run immediately
    trackTimerRef.current = window.setInterval(() => {
      captureAndSaveLocation()
    }, 60_000)
  }, [tracking, captureAndSaveLocation, stopTracking])

  const mapCenter = useMemo(() => {
    if (position) return [position.lat, position.lng]
    // Default: Bucharest (nice fallback for first load)
    return [44.4268, 26.1025]
  }, [position])

  const rows = Array.isArray(dbData?.data) ? dbData.data : []
  const columns = rows.length > 0 && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []

  if (authLoading) {
    return (
      <main className="page">
        <section className="card">
          <p className="status">Checking session…</p>
        </section>
      </main>
    )
  }

  if (!authUser) {
    return (
      <main className="page">
        <header className="pageHeader">
          <div className="titleBlock">
            <h1>SorinB</h1>
            <p className="subtitle">Login required (user or admin)</p>
          </div>
        </header>

        <section className="card">
          {authError && <p className="status error">{authError}</p>}

          <div className="authTabs">
            <button
              className="btn"
              onClick={() => setAuthMode('login')}
              disabled={authMode === 'login'}
              type="button"
            >
              Login
            </button>
            <button
              className="btn"
              onClick={() => setAuthMode('register')}
              disabled={authMode === 'register'}
              type="button"
            >
              Register
            </button>
          </div>

          <form className="authForm" onSubmit={submitAuth}>
            <label className="field">
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
            </label>

            <div className="actions">
              <button className="btn" type="submit">
                {authMode === 'register' ? 'Create account' : 'Login'}
              </button>
            </div>

            <p className="muted" style={{ marginTop: 10 }}>
              Admin login: set server env vars <strong>ADMIN_EMAIL</strong> and <strong>ADMIN_PASSWORD</strong> once, then login.
            </p>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="pageHeader">
        <div className="titleBlock">
          <h1>All Database Data</h1>
          <p className="subtitle">API base: {apiBase || '(same-origin)'}</p>
          <p className="subtitle">
            Signed in as: <strong>{authUser.email}</strong> ({authUser.role})
          </p>
        </div>

        <div className="actions">
          {authUser.role === 'admin' && (
            <button className="btn" onClick={fetchData}>
              Refresh
            </button>
          )}
          <button className="btn" onClick={logout}>
            Logout
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
        {tracking && <p className="status">Tracking is ON (saves every 1 minute)</p>}
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

      {authUser.role === 'admin' && (
        <section className="card">
          {loading && <p className="status">Loading all data from database…</p>}
          {error && <p className="status error">Error: {error}</p>}

          {dbData && (
            <>
              <div className="sectionHeader">
                <h2>Users (admin)</h2>
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
      )}
    </main>
  )
}

export default App


