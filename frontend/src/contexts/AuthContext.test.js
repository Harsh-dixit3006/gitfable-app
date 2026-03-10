import fs from "fs";
import path from "path";

const authContextSource = fs.readFileSync(path.join(process.cwd(), "src/contexts/AuthContext.js"), "utf8");

describe("AuthContext Supabase Integration", () => {
  test("imports supabase from lib/supabase", () => {
    expect(authContextSource).toContain("from '@/lib/supabase'");
  });

  test("uses supabase.auth.onAuthStateChange", () => {
    expect(authContextSource).toContain("supabase.auth.onAuthStateChange");
  });

  test("sets Authorization header", () => {
    expect(authContextSource).toContain("api.defaults.headers.common.Authorization");
  });
});
