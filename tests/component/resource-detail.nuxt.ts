import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { readBody } from "h3";
import { expect, test, vi } from "vitest";
import ResourceDetailPage from "../../pages/resources/[resourceId].vue";
import ResourceListPage from "../../pages/resources/index.vue";
import type { ResourceDetail } from "../../shared/contracts";
import { emptyPortalCapabilities } from "../../shared/permissions";

const resourceId = "https://api.example.test/projects";
const path = `/resources/${encodeURIComponent(resourceId)}`;
const apiPath = `/api${path.replace("%3A", ":")}`;
const webhookPath = `${apiPath}/backchannel/logout`;
const resource: ResourceDetail = {
  resourceId,
  name: "Projects API",
  availableScopes: ["projects.read"],
  backchannelLogoutUri: null,
  capabilities: { update: true, delete: false },
};
const webhookChanges: Array<string | null> = [];
const issuedSecret = "sk-" + "s".repeat(43);
const rotationBodies: unknown[] = [];

registerEndpoint("/api/me", () => ({
  user: { id: "00000000-0000-4000-8000-000000000001", name: "Tester", image: null },
  capabilities: { ...emptyPortalCapabilities, resourcesRead: true },
  status: 200,
}));
registerEndpoint("/api/resources", () => ({ resources: [{ resourceId, name: resource.name }] }));
registerEndpoint(apiPath, () => ({ resource }));
registerEndpoint(webhookPath, {
  method: "PUT",
  handler: async (event) => {
    const { backchannelLogoutUri } = await readBody<{ backchannelLogoutUri: string }>(event);
    webhookChanges.push(backchannelLogoutUri);
    return { backchannelLogoutUri };
  },
});
registerEndpoint(webhookPath, {
  method: "DELETE",
  handler: () => {
    webhookChanges.push(null);
    return { backchannelLogoutUri: null };
  },
});

test("lists resources at /resources with resource read access alone", async () => {
  const wrapper = await mountSuspended(ResourceListPage, { route: "/resources" });
  expect(wrapper.get("h1").text()).toBe("Resource Servers");
  await vi.waitFor(() => {
    expect(wrapper.get(`a[href="${path}"]`).text()).toBe("Projects API");
  });
  wrapper.unmount();
});
registerEndpoint(`${apiPath}/secret/rotate`, {
  method: "POST",
  handler: async (event) => {
    rotationBodies.push(await readBody(event));
    return { resourceSecret: issuedSecret };
  },
});

test("saves or clears the webhook and rotates the resource secret", async () => {
  const wrapper = await mountSuspended(ResourceDetailPage, { route: path });
  await flushPromises();
  expect(wrapper.text()).toContain("Projects API");
  expect(wrapper.get('a[href="/resources"]').text()).toBe("Back to Resource Servers");
  const tabs = wrapper.findAll('[role="tab"]');
  expect(tabs.map((tab) => tab.text())).toEqual(["Scopes", "Backchannel", "Secret"]);
  expect(wrapper.text()).toContain("projects.read");
  expect(wrapper.text()).not.toContain("Delete resource");

  await tabs[1]!.trigger("click");
  const webhookForm = wrapper.get("#pane-backchannel form");
  expect(webhookForm.findAll("input")).toHaveLength(1);
  const webhook = webhookForm.get("input");
  const uri = "https://api.example.test/logout";
  await webhook.setValue(uri);
  await webhookForm.trigger("submit");
  await vi.waitFor(() => {
    expect(webhookChanges).toEqual([uri]);
    expect(webhook.element.disabled).toBe(false);
  });

  await webhook.setValue("");
  await webhookForm.trigger("submit");
  await vi.waitFor(() => expect(webhookChanges).toEqual([uri, null]));

  await tabs[2]!.trigger("click");
  const secretPanel = wrapper.get("#pane-secret");
  expect(secretPanel.find("input").exists()).toBe(false);
  const rotate = secretPanel.get("button");
  await vi.waitFor(() => expect(rotate.element.disabled).toBe(false));
  await rotate.trigger("click");
  const confirm = await vi.waitFor(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".el-message-box__btns button")]
      .find((candidate) => candidate.textContent?.trim() === "Rotate secret");
    expect(button).toBeDefined();
    return button!;
  });
  confirm.click();
  await vi.waitFor(() => {
    expect(rotationBodies).toEqual([undefined]);
    expect(wrapper.get("textarea").element.value).toBe(issuedSecret);
    expect(wrapper.get("textarea").element.readOnly).toBe(true);
  });
  const copied = wrapper.findAll("button").find((button) => button.text() === "I have copied it");
  expect(copied).toBeDefined();
  await copied!.trigger("click");
  await vi.waitFor(() => expect(wrapper.find("textarea").element?.value ?? "").toBe(""));
  wrapper.unmount();
});
