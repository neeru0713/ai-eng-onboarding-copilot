import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "feedback.db");

// Initialize Database
const db = new Database(DB_PATH);

// Create feedback table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    ts TEXT NOT NULL,
    query TEXT,
    answer TEXT,
    feedback_type TEXT DEFAULT 'none',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_ts ON feedback(channel, ts);
`);

/**
 * Saves the query and answer along with Slack message identifiers (channel, ts)
 */
export function saveAnswer(channel: string, ts: string, query: string, answer: string) {
  try {
    const stmt = db.prepare(`
      INSERT INTO feedback (channel, ts, query, answer)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(channel, ts) DO UPDATE SET
        query = excluded.query,
        answer = excluded.answer
    `);
    stmt.run(channel, ts, query, answer);
    console.log(`[Feedback DB] Saved response for message ts: ${ts} in channel: ${channel}`);
  } catch (err: any) {
    console.error(`[Feedback DB] Failed to save answer:`, err.message);
  }
}

/**
 * Updates the feedback type based on the user reaction.
 * Map "+1" / "thumbsup" to "thumbs_up" and "-1" / "thumbsdown" to "thumbs_down".
 */
export function logFeedback(channel: string, ts: string, reaction: string) {
  let feedbackType: string | null = null;
  
  if (reaction === "thumbsup" || reaction === "+1") {
    feedbackType = "thumbs_up";
  } else if (reaction === "thumbsdown" || reaction === "-1") {
    feedbackType = "thumbs_down";
  } else {
    // Ignore other reactions
    return;
  }

  try {
    const stmt = db.prepare(`
      UPDATE feedback
      SET feedback_type = ?
      WHERE channel = ? AND ts = ?
    `);
    const result = stmt.run(feedbackType, channel, ts);
    if (result.changes > 0) {
      console.log(`[Feedback DB] Updated feedback to '${feedbackType}' for message ts: ${ts} in channel: ${channel}`);
    } else {
      // In case the message was not previously logged, insert a stub
      const insertStmt = db.prepare(`
        INSERT INTO feedback (channel, ts, feedback_type)
        VALUES (?, ?, ?)
        ON CONFLICT(channel, ts) DO UPDATE SET
          feedback_type = excluded.feedback_type
      `);
      insertStmt.run(channel, ts, feedbackType);
      console.log(`[Feedback DB] Created feedback stub '${feedbackType}' for message ts: ${ts} in channel: ${channel}`);
    }
  } catch (err: any) {
    console.error(`[Feedback DB] Failed to log feedback:`, err.message);
  }
}

/**
 * Helper to retrieve all feedback rows (used for plotting or verification)
 */
export function getFeedbackStats() {
  try {
    const rows = db.prepare("SELECT * FROM feedback").all();
    return rows;
  } catch (err: any) {
    console.error(`[Feedback DB] Failed to retrieve feedback stats:`, err.message);
    return [];
  }
}
