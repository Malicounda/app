import sqlite3, json, sys
p=r"client/src-tauri/server/data/scodipp.db"
try:
    conn=sqlite3.connect(p)
except Exception as e:
    print(json.dumps({"error":"cannot open db","detail":str(e)}))
    sys.exit(0)
cur=conn.cursor()
queries=[
 ("by_entity_status",
  "SELECT entity, status, COUNT(*) as count FROM outbox GROUP BY entity, status ORDER BY entity, status;"),
 ("duplicates_alerts_pending",
  "SELECT payload, COUNT(*) as duplicate_count, GROUP_CONCAT(id) as ids FROM outbox WHERE entity = 'alert' AND status = 'pending' GROUP BY payload HAVING COUNT(*) > 1 ORDER BY duplicate_count DESC;"),
 ("oldest_pending_failed",
  "SELECT id, entity, status, created_at, datetime(created_at/1000, 'unixepoch') as timestamp, substr(payload,1,200) as payload_preview FROM outbox WHERE status IN ('pending','failed') ORDER BY created_at ASC LIMIT 20;"),
 ("success_rate_alerts_messages",
  "SELECT ROUND( (CAST(COUNT(CASE WHEN status='acked' THEN 1 END) AS FLOAT) * 100.0) / NULLIF(COUNT(*),0),2) as success_rate FROM outbox WHERE entity IN ('alert','message');"),
 ("failed_errors",
  "SELECT last_error, COUNT(*) as count FROM outbox WHERE status = 'failed' GROUP BY last_error ORDER BY count DESC;"),
]
out={}
for name,q in queries:
    try:
        cur.execute(q)
        cols=[d[0] for d in cur.description] if cur.description else []
        rows=cur.fetchall()
        # Convert rows to lists for JSON
        rows_list=[list(r) for r in rows]
        out[name]={'cols':cols,'rows':rows_list}
    except Exception as e:
        out[name]={'error':str(e)}
print(json.dumps(out, indent=2, ensure_ascii=False))
conn.close()
