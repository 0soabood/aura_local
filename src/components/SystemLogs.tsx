import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { SystemLog } from '../shared/types';

const aura = (window as any).aura;

type LevelFilter = 'all' | SystemLog['level'];

const LOG_LEVELS: LevelFilter[] = ['all', 'info', 'warn', 'error', 'audit'];

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LevelFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newMsg, setNewMsg] = useState('manual log entry');
  const [newLevel, setNewLevel] = useState<SystemLog['level']>('info');
  const [newModule, setNewModule] = useState('operator');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await aura.listLogs(200);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLog = async () => {
    if (!newMsg) return;
    try {
      await aura.createLog(newLevel, newModule.trim() || 'operator', newMsg, { timestamp: Date.now() });
      setNewMsg('manual log entry');
      await fetchLogs();
    } catch (err) {
      console.error('Failed to create log:', err);
    }
  };

  const filteredLogs = useMemo(() => logs.filter(log => {
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      log.message.toLowerCase().includes(query)
      || log.module.toLowerCase().includes(query)
      || log.level.toLowerCase().includes(query);
    return matchesLevel && matchesSearch;
  }), [logs, filterLevel, searchQuery]);

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <b>System Logs</b>
          <span>{filteredLogs.length} records</span>
        </div>
        <div className="page-hd-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-4)' }}>max 200</span>
          <button onClick={fetchLogs} title="Refresh" style={{ color: 'var(--text-3)' }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 700ms linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div className="page-body" style={{ padding: 'var(--pad-1)' }}>
        <div className="logs">
          <div className="logs-toolbar">
            <div className="logs-filter">
              {LOG_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  className={filterLevel === lvl ? 'active' : ''}
                  onClick={() => setFilterLevel(lvl)}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="logs-search">
              <Search size={11} />
              <input
                placeholder="search message, module, level..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="logs-table">
            <div className="log-row hdr">
              <span>timestamp</span>
              <span>level</span>
              <span>module</span>
              <span>message</span>
            </div>

            {filteredLogs.map((log) => (
              <div className="log-row" key={log.id}>
                <span className="lts">{new Date(log.created_at).toISOString().slice(11, 23)}</span>
                <span className={`llv ${log.level}`}>{log.level}</span>
                <span className="lsrc">{log.module}</span>
                <span className="lmsg">{log.message}</span>
              </div>
            ))}

            {!loading && filteredLogs.length === 0 && (
              <div style={{ color: 'var(--text-4)', fontSize: 'var(--fs-sm)', padding: '8px var(--pad-2)' }}>— no logs match current filters —</div>
            )}
          </div>

          <div className="log-add">
            <select value={newLevel} onChange={(e) => setNewLevel(e.target.value as SystemLog['level'])}>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
              <option value="audit">audit</option>
            </select>

            <input
              value={newModule}
              onChange={(e) => setNewModule(e.target.value)}
              placeholder="module"
              style={{ width: 130 }}
            />

            <input
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder="message"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateLog()}
            />

            <button className="btn primary" onClick={handleCreateLog}>add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
