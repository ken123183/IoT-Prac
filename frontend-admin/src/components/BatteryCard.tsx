import React from 'react';

export interface BatteryData {
  batteryId: string;
  capacity: number;
  status: string;
  health: number;
}

interface BatteryCardProps {
  battery: BatteryData;
  onRent: (id: string) => void;
  onReturn: (id: string) => void;
  isProcessing: boolean;
}

const BatteryCard: React.FC<BatteryCardProps> = ({ battery, onRent, onReturn, isProcessing }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'AVAILABLE': 
        return { color: '#10b981', label: battery.capacity < 100 ? 'Charging' : 'Ready' };
      case 'RENTED': 
        return { color: '#f59e0b', label: 'In Use' };
      case 'MAINTENANCE': 
        return { color: '#ef4444', label: 'Fault' };
      default: 
        return { color: '#6b7280', label: 'Offline' };
    }
  };

  const getCapacityColor = (cap: number) => {
    if (cap > 50) return '#10b981';
    if (cap > 20) return '#f59e0b';
    return '#ef4444';
  };

  const config = getStatusConfig(battery.status);

  return (
    <div className="battery-card">
      <div className="db-sync-indicator" title="Syncing to PostgreSQL..."></div>
      
      <div className="battery-header">
        <span className="battery-id">{battery.batteryId}</span>
        <span 
          className="status-badge" 
          style={{ 
            color: config.color,
            border: `1px solid ${config.color}33`,
            backgroundColor: `${config.color}11`
          }}
        >
           {config.label}
        </span>
      </div>

      <div className="capacity-container">
        <div className="capacity-label">
          <div>
            <span className="cap-value">{Math.floor(battery.capacity)}</span>
            <span className="cap-unit">.{ (battery.capacity % 1).toFixed(1).substring(2) }%</span>
          </div>
        </div>
        <div className="progress-bar-bg">
          <div 
            className="progress-bar-fill" 
            style={{ 
              width: `${battery.capacity}%`,
              backgroundColor: getCapacityColor(battery.capacity),
              boxShadow: `0 0 15px ${getCapacityColor(battery.capacity)}44`
            }}
          ></div>
        </div>
      </div>

      <div className="battery-info">
        <div className="info-item">
          <span className="label">Health</span>
          <span className="value">{battery.health}%</span>
        </div>
        <div className="info-item">
          <span className="label">Type</span>
          <span className="value">Li-ion Pro</span>
        </div>
      </div>

      <div className="battery-footer">
        {battery.status === 'AVAILABLE' ? (
          <button 
            className="btn btn-primary" 
            onClick={() => onRent(battery.batteryId)}
            disabled={isProcessing || battery.capacity <= 0}
          >
            {isProcessing ? 'Connecting...' : 'Rent Battery'}
          </button>
        ) : battery.status === 'RENTED' ? (
          <button 
            className="btn btn-secondary" 
            onClick={() => onReturn(battery.batteryId)}
            disabled={isProcessing}
          >
             {isProcessing ? 'Syncing...' : 'Return Battery'}
          </button>
        ) : (
          <button className="btn btn-secondary" disabled>Service Mode</button>
        )}
      </div>
    </div>
  );
};

export default BatteryCard;
