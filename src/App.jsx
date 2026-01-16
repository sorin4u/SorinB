import { useState, useEffect, useCallback } from 'react'
import './App.css'

function App() {
  const [dbData, setDbData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const apiBase = import.meta.env.VITE_API_BASE_URL || ''

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


