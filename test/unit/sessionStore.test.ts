// sessionStore 单测：目录编码、历史列表、外部修改检测（临时目录 fixture，离线）。

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SessionFileWatcher,
  defaultSessionsRoot,
  encodeSessionDirName,
  listSessions,
  mostRecentSession,
} from "../../src/session/sessionStore";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdysyhj-sessions-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeSession(fileName: string, lines: object[], mtimeMs?: number): string {
  const dir = path.join(tmpRoot, encodeSessionDirName("/data/workspace/proj"));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  if (mtimeMs !== undefined) {
    fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
  }
  return filePath;
}

describe("encodeSessionDirName", () => {
  it("与 pi 一致：去首分隔符、[/\\\\:] → '-'，外裹 --…--", () => {
    expect(encodeSessionDirName("/data/workspace/Sdysyhj")).toBe("--data-workspace-Sdysyhj--");
    expect(encodeSessionDirName("/home/user/my:proj")).toBe("--home-user-my-proj--");
  });
});

describe("listSessions", () => {
  it("解析标题（session_info 名称优先）、消息数、时间", () => {
    writeSession(
      "2026-01-01T00-00-00-000Z_aaa.jsonl",
      [
        { type: "session", version: 3, id: "aaa", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/data/workspace/proj" },
        { type: "message", id: "e1", parentId: null, timestamp: "t", message: { role: "user", content: "帮我重构登录函数", timestamp: 1 } },
        { type: "message", id: "e2", parentId: "e1", timestamp: "t", message: { role: "assistant", content: [{ type: "text", text: "好的" }], stopReason: "stop", timestamp: 2 } },
        { type: "session_info", id: "e3", parentId: "e2", timestamp: "t", name: "重构鉴权" },
      ],
      1700000000000
    );

    const sessions = listSessions("/data/workspace/proj", tmpRoot);
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe("aaa");
    expect(sessions[0].name).toBe("重构鉴权");
    expect(sessions[0].title).toBe("重构鉴权");
    expect(sessions[0].messageCount).toBe(2);
    expect(sessions[0].modifiedAt).toBe(1700000000000);
  });

  it("无命名时标题取首条用户消息摘要", () => {
    writeSession("2026-01-02T00-00-00-000Z_bbb.jsonl", [
      { type: "session", version: 3, id: "bbb", timestamp: "2026-01-02T00:00:00.000Z", cwd: "/data/workspace/proj" },
      { type: "message", id: "e1", parentId: null, timestamp: "t", message: { role: "user", content: "看一下这个文件并总结", timestamp: 1 } },
    ]);

    const sessions = listSessions("/data/workspace/proj", tmpRoot);
    expect(sessions[0].title).toBe("看一下这个文件并总结");
  });

  it("按修改时间倒序；mostRecentSession 返回最新", () => {
    writeSession("old_ccc.jsonl", [{ type: "session", id: "ccc", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/data/workspace/proj" }], 1000);
    writeSession("new_ddd.jsonl", [{ type: "session", id: "ddd", timestamp: "2026-01-03T00:00:00.000Z", cwd: "/data/workspace/proj" }], 3000);

    const sessions = listSessions("/data/workspace/proj", tmpRoot);
    expect(sessions.map((s) => s.id)).toEqual(["ddd", "ccc"]);
    expect(mostRecentSession("/data/workspace/proj", tmpRoot)?.id).toBe("ddd");
  });

  it("目录不存在返回空数组", () => {
    expect(listSessions("/no/such/workspace", tmpRoot)).toEqual([]);
    expect(mostRecentSession("/no/such/workspace", tmpRoot)).toBeNull();
  });

  it("损坏行跳过不致命", () => {
    const dir = path.join(tmpRoot, encodeSessionDirName("/data/workspace/proj"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bad.jsonl"), '{"type":"session","id":"x"}\n{broken\n');
    const sessions = listSessions("/data/workspace/proj", tmpRoot);
    expect(sessions.length).toBe(1);
  });
});

describe("defaultSessionsRoot", () => {
  it("环境变量优先", () => {
    expect(defaultSessionsRoot({ PI_CODING_AGENT_SESSION_DIR: "/custom/sessions" })).toBe(path.resolve("/custom/sessions"));
    const root = defaultSessionsRoot({ PI_CODING_AGENT_DIR: "/custom/agent" });
    expect(root).toBe(path.join("/custom/agent", "sessions"));
    const fallback = defaultSessionsRoot({});
    expect(fallback).toBe(path.join(os.homedir(), ".pi", "agent", "sessions"));
  });
});

describe("SessionFileWatcher（FR-SESS-07）", () => {
  it("外部修改/删除可检测；无变化不误报", () => {
    const filePath = path.join(tmpRoot, "watched.jsonl");
    fs.writeFileSync(filePath, '{"type":"session","id":"w"}\n');
    let fired = 0;
    const watcher = new SessionFileWatcher({ onExternalChange: () => (fired += 1) });
    watcher.track(filePath);

    expect(watcher.check()).toBe(false); // 无变化

    fs.appendFileSync(filePath, '{"type":"message","id":"e1"}\n'); // 模拟外部（终端 pi）写入
    expect(watcher.check()).toBe(true);
    expect(watcher.check()).toBe(false); // 基线已更新

    fs.rmSync(filePath); // 外部删除
    expect(watcher.check()).toBe(true);
    watcher.dispose();
  });

  it("markSynced 同步基线（本端写入不误报）", () => {
    const filePath = path.join(tmpRoot, "watched2.jsonl");
    fs.writeFileSync(filePath, "a\n");
    const watcher = new SessionFileWatcher({ onExternalChange: () => undefined });
    watcher.track(filePath);
    fs.appendFileSync(filePath, "b\n"); // 本端（pi 子进程）写入
    watcher.markSynced();
    expect(watcher.check()).toBe(false);
    watcher.dispose();
  });

  it("start/stop 定时检查触发回调", async () => {
    const filePath = path.join(tmpRoot, "watched3.jsonl");
    fs.writeFileSync(filePath, "a\n");
    let fired = 0;
    const watcher = new SessionFileWatcher({ intervalMs: 20, onExternalChange: () => (fired += 1) });
    watcher.track(filePath);
    watcher.start();
    fs.appendFileSync(filePath, "b\n");
    await new Promise((r) => setTimeout(r, 80));
    watcher.dispose();
    expect(fired).toBeGreaterThanOrEqual(1);
  });
});
