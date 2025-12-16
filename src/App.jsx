import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [dbData, setDbData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch data from database
    fetch('http://localhost:3000/api/data')
      .then(response => response.json())
      .then(data => {
        setDbData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <>
      <div>
        <h1>📊 All Database Data</h1>
      </div>
      
      <div className="card">
        {loading && <p>Loading all data from database...</p>}
        
        {error && <p style={{color: 'red'}}>Error: {error}</p>}
        
        {dbData && (
          <div>
            {/* <h2>✅ Connected to Neon PostgreSQL</h2>
            
           <h3>All Tables ({dbData.tables ? dbData.tables.length : 0}):</h3> */}
            {/* <ul>
              {dbData.tables && dbData.tables.map((table, index) => (
                <li key={index}>{table.table_name}</li>
              ))}
            </ul> */}
            
            <h3>All Data from Database:</h3>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              margin: '20px 0',
              fontSize: '16px',
              textAlign: 'left'
            }}>
              {/* <thead>
                <tr style={{
                  backgroundColor: '#646cff',
                  color: 'white',
                  borderBottom: '2px solid #ddd'
                }}>
                  {dbData.data && dbData.data.length > 0 && 
                    Object.keys(dbData.data[0]).map((key, index) => (
                      <th key={index} style={{padding: '12px', border: '1px solid #ddd'}}>
                        {key}
                      </th>
                    ))
                  }
                </tr>
              </thead> */}
              <tbody>
                {dbData.data && dbData.data.map((row, rowIndex) => (
                  <tr key={rowIndex} style={{
                    backgroundColor: rowIndex % 2 === 0 ? '#f9f9f9' : 'white',
                    borderBottom: '1px solid #ddd'
                  }}>
                    {Object.values(row).map((value, colIndex) => (
                      <td key={colIndex} style={{padding: '12px', border: '1px solid #ddd'}}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            
            <p style={{marginTop: '20px', fontSize: '14px', color: '#888'}}>
              Total rows: {dbData.data ? dbData.data.length : 0}
            </p>
          </div>
        )}
      </div>
    </>
  )
}

export default App
