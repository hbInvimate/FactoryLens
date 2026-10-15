// People in the in-process test database (FL_STORAGE=memory) only. That database starts empty in every
// test run and never touches Neon, so these made-up accounts exist nowhere else.
import type { Role } from "./roles";

export const TEST_USERS: { name: string; email: string; role: Role; password: string }[] = [
  { name: "Test Quality Technician", email: "technician@test.local", role: "technician", password: "technician-test-pass" },
  { name: "Test Process engineer", email: "engineer@test.local", role: "engineer", password: "engineer-test-pass" },
  { name: "Test Admin", email: "admin@test.local", role: "admin", password: "admin-test-pass" },
  // Only the rate-limit test signs in with this one, so locking it does not disturb other tests.
  { name: "Test Locked Technician", email: "locked@test.local", role: "technician", password: "locked-test-pass" },
];
