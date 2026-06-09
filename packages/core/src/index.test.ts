import { describe, expect, it } from "vitest";
import { assertTaskTransition, canTransitionTask } from "./index.js";

describe("task state machine", () => {
  it("allows queued tasks to start running", () => {
    expect(canTransitionTask("queued", "running")).toBe(true);
  });

  it("allows running tasks to complete", () => {
    expect(canTransitionTask("running", "completed")).toBe(true);
  });

  it("rejects completed tasks moving back to running", () => {
    expect(() => assertTaskTransition("completed", "running")).toThrow("非法任务状态流转");
  });
});
