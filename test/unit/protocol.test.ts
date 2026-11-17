// RPC 记录判别与解析单测。

import { describe, expect, it } from "vitest";
import { isRpcEvent, isRpcResponse, parseRecord } from "../../src/bridge/protocol";

describe("parseRecord", () => {
  it("解析 response 记录", () => {
    const record = parseRecord('{"type":"response","id":"r1","command":"get_state","success":true,"data":{}}');
    expect("parseError" in record).toBe(false);
    if (!("parseError" in record)) {
      expect(isRpcResponse(record)).toBe(true);
    }
  });

  it("解析事件记录", () => {
    const record = parseRecord('{"type":"agent_settled","aborted":true}');
    expect("parseError" in record).toBe(false);
    if (!("parseError" in record)) {
      expect(isRpcEvent(record)).toBe(true);
    }
  });

  it("非法 JSON 返回 parseError", () => {
    const record = parseRecord("{not json");
    expect("parseError" in record).toBe(true);
  });

  it("无 type 字段返回 parseError", () => {
    const record = parseRecord('{"foo":1}');
    expect("parseError" in record).toBe(true);
  });
});
