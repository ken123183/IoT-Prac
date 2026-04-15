import { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

interface Battery {
  id: string;
  capacity: number;
  status: 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';
  currentUserId?: string;
}

function App() {
  const [batteries, setBatteries] = useState<Record<string, Battery>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/batteries');
        const data = await res.json();
        const initialMap: Record<string, Battery> = {};
        data.forEach((b: Battery) => {
          initialMap[b.id] = b;
        });
        setBatteries(initialMap);
      } catch (err) {
        console.error('Failed to initial fetch', err);
      }
    };

    fetchInitialState();

    socket.on('batteryUpdate', (update: Battery) => {
      setBatteries(prev => ({
        ...prev,
        [update.id]: update
      }));
    });

    socket.on('systemReset', () => {
      setBatteries({});
    });

    return () => {
      socket.off('batteryUpdate');
      socket.off('systemReset');
    };
  }, []);

  // --- 核心統計邏輯 ---
  const stats = useMemo(() => {
    const list = Object.values(batteries);
    const total = list.length;
    const available = list.filter(b => b.status === 'AVAILABLE').length;
    const rented = list.filter(b => b.status === 'RENTED').length;
    const maintenance = list.filter(b => b.status === 'MAINTENANCE').length;
    
    // 電量分布分布 [0-20, 21-50, 51-80, 81-100]
    const dist = [0, 0, 0, 0];
    let sumCapacity = 0;
    list.forEach(b => {
      sumCapacity += b.capacity;
      if (b.capacity <= 20) dist[0]++;
      else if (b.capacity <= 50) dist[1]++;
      else if (b.capacity <= 80) dist[2]++;
      else dist[3]++;
    });

    return {
      total, available, rented, maintenance,
      avgCapacity: total > 0 ? (sumCapacity / total).toFixed(1) : 0,
      distribution: dist
    };
  }, [batteries]);

  // --- 管理功能：手動租借 ---
  const handleRent = async (id: string) => {
    setLoading(true);
    try {
      await fetch(`http://localhost:8080/api/rental/rent`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batteryId: id, userId: 'ADMIN_USER' })
      });
    } catch (err) {
      console.error('Failed to rent battery', err);
    } finally {
      setLoading(false);
    }
  };

  const handleForceReturn = async (id: string) => {
    setLoading(true);
    try {
      await fetch(`http://localhost:8080/api/rental/return/${id}`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to return battery', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalibrate = async () => {
    if (!window.confirm("確定要重置全系統嗎？")) return;
    setLoading(true);
    try {
      await fetch('http://localhost:8080/api/admin/reset', { method: 'POST' });
      setBatteries({}); 
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const filteredList = useMemo(() => {
    const list = Object.values(batteries);
    return list
      .filter(b => b.id.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 50); // 效能優化：僅顯示前 50 筆，其餘過濾
  }, [batteries, searchTerm]);

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="header-tags">
          <h1>⚡ Battery Digital Twin <small>Master Dashboard</small></h1>
          <div className="stats-badge">9800X3D Performance Optimized</div>
        </div>
        
        <div className="header-actions">
          <input 
            type="text" 
            placeholder="Search Battery ID..." 
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="reset-btn" onClick={handleRecalibrate} disabled={loading}>
            {loading ? "Syncing..." : "⚡ RECALIBRATE SYSTEM"}
          </button>
        </div>
      </header>

      {/* --- 統計儀表板區域 --- */}
      <section className="stats-board">
        <div className="stat-card">
          <label>TOTAL ASSETS</label>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat-card highlight-green">
          <label>AVAILABLE</label>
          <div className="value">{stats.available}</div>
        </div>
        <div className="stat-card highlight-orange">
          <label>RENTED</label>
          <div className="value">{stats.rented}</div>
        </div>
        <div className="stat-card highlight-blue">
          <label>AVG CAPACITY</label>
          <div className="value">{stats.avgCapacity}%</div>
        </div>
        
        <div className="stat-card wide">
          <label>CAPACITY DISTRIBUTION</label>
          <div className="dist-chart">
            {['Critical', 'Low', 'Normal', 'Full'].map((label, i) => {
              const percentage = stats.total > 0 ? (stats.distribution[i] / stats.total) * 100 : 0;
              return (
                <div key={label} className="chart-col">
                  <div className="bar-wrapper">
                    <div 
                      className={`bar bar-${i}`} 
                      style={{ height: `${percentage}%` }}
                    ></div>
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <main className="list-content">
        <table className="battery-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Capacity</th>
              <th>Owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.map(battery => (
              <tr key={battery.id} className={`status-${battery.status.toLowerCase()}`}>
                <td className="font-mono">{battery.id}</td>
                <td><span className={`badge badge-${battery.status.toLowerCase()}`}>{battery.status}</span></td>
                <td>
                  <div className="capacity-bar-mini">
                    <div className="fill" style={{ 
                        width: `${battery.capacity}%`,
                        backgroundColor: battery.capacity < 20 ? '#ff4d4f' : '#3fb950'
                      }}></div>
                    <span>{Math.round(battery.capacity)}%</span>
                  </div>
                </td>
                <td className="user-id">{battery.currentUserId || '-'}</td>
                <td>
                  {battery.status === 'RENTED' ? (
                    <button className="action-btn return" onClick={() => handleForceReturn(battery.id)}>Return</button>
                  ) : (
                    <button className="action-btn" onClick={() => handleRent(battery.id)}>Rent</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredList.length === 0 && <div className="empty-state">No matches found.</div>}
      </main>
    </div>
  );
}

export default App;
