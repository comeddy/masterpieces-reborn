// test/integrity.test.mjs — data.js가 가리키는 파일이 실제로 존재하는지
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WORKS } from "../js/data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("모든 작품 모듈 파일이 존재한다", () => {
  for (const w of WORKS) {
    assert.ok(existsSync(join(root, "js", w.module)), `${w.no}: ${w.module} 없음`);
  }
});

test("asset이 선언된 작품의 이미지 파일이 존재한다", () => {
  for (const w of WORKS.filter((w) => w.asset)) {
    assert.ok(existsSync(join(root, w.asset)), `${w.no}: ${w.asset} 없음`);
  }
});

test("모든 작품 모듈이 인터페이스 4메서드를 export한다", async () => {
  for (const w of WORKS) {
    const mod = await import(join(root, "js", w.module));
    for (const m of ["init", "tick", "resize", "dispose"]) {
      assert.equal(typeof mod.default[m], "function", `${w.no}.${m}`);
    }
  }
});
