import { describe, expect, test } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import PageHeader from "~/components/PageHeader.vue";

describe("PageHeader", () => {
  test("renders title, description, and actions", async () => {
    const component = await mountSuspended(PageHeader, {
      props: {
        title: "Incidents",
        description: "Track workspace incidents.",
      },
      slots: {
        actions: "<button>Report incident</button>",
      },
    });
    expect(component.find("h1").text()).toBe("Incidents");
    expect(component.text()).toContain("Track workspace incidents.");
    expect(component.find("button").text()).toBe("Report incident");
  });

  test("renders a back link when provided", async () => {
    const component = await mountSuspended(PageHeader, {
      props: { title: "Task", backTo: "/tasks", backLabel: "Tasks" },
    });
    const link = component.find("a");
    expect(link.attributes("href")).toBe("/tasks");
    expect(link.text()).toBe("Tasks");
  });
});
