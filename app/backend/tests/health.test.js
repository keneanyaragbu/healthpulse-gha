const request = require("supertest");
const app = require("../server");

describe("HealthPulse API", () => {

  test("GET /api/health should return healthy status", async () => {
    const response = await request(app)
      .get("/api/health");

    expect(response.statusCode).toBe(200);

    expect(response.body).toEqual({
      status: "healthy",
      service: "healthpulse-backend"
    });
  });

  test("GET /api/appointments should return appointments", async () => {
    const response = await request(app)
      .get("/api/appointments");

    expect(response.statusCode).toBe(200);

    expect(Array.isArray(response.body)).toBe(true);

    expect(response.body.length).toBeGreaterThan(0);
  });

});
