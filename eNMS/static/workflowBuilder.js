/*
global
action: false
alertify: false
call: false
createPanel: false
fCall: false
normalRun: false
runLogic: false
showLogsPanel: false
showPanel: false
showResultsPanel: false
showTypePanel: false
userIsActive: true
vis: false
workflow: true
workflowRunMode: false
*/

vis.Network.prototype.zoom = function(scale) {
  const animationOptions = {
    scale: this.getScale() + scale,
    animation: { duration: 300 },
  };
  this.view.moveTo(animationOptions);
};

const container = document.getElementById("network");
const dsoptions = {
  edges: {
    font: {
      size: 12,
    },
  },
  nodes: {
    shape: "box",
    font: {
      bold: {
        color: "#0077aa",
      },
    },
  },
  interaction: {
    hover: true,
    hoverConnectedEdges: false,
    multiselect: true,
  },
  manipulation: {
    enabled: false,
    addNode: function(data, callback) {},
    addEdge: function(data, callback) {
      if (data.to == 1) {
        alertify.notify("You cannot draw an edge to 'Start'.", "error", 5);
      }
      if (data.from == 2) {
        alertify.notify("You cannot draw an edge from 'End'.", "error", 5);
      }
      if (data.from != data.to) {
        data.subtype = currentMode;
        saveEdge(data);
      }
    },
  },
};

let nodes;
let edges;
let graph;
let selectedObject;
let currentMode = "motion";
let mousePosition;
let currLabel;
let arrowHistory = [];
let arrowPointer = -1;
let currentRuntime;
let triggerMenu;

function displayWorkflow(workflowData) {
  workflow = workflowData.workflow;
  nodes = new vis.DataSet(workflow.services.map(serviceToNode));
  edges = new vis.DataSet(workflow.edges.map(edgeToEdge));
  workflow.services
    .filter((s) => s.iteration_values != "")
    .map(drawIterationEdge);
  for (const [id, label] of Object.entries(workflow.labels)) {
    drawLabel(id, label);
  }
  graph = new vis.Network(container, { nodes: nodes, edges: edges }, dsoptions);
  graph.setOptions({ physics: false });
  graph.on("oncontext", function(properties) {
    if (triggerMenu) {
      // eslint-disable-next-line new-cap
      mousePosition = graph.DOMtoCanvas({
        x: properties.event.offsetX,
        y: properties.event.offsetY,
      });
      properties.event.preventDefault();
      const node = this.getNodeAt(properties.pointer.DOM);
      const edge = this.getEdgeAt(properties.pointer.DOM);
      if (typeof node !== "undefined" && node != 1 && node != 2) {
        graph.selectNodes([node]);
        $(".menu-entry ").hide();
        $(`.${node.length == 36 ? "label" : "node"}-selection`).show();
        selectedObject = nodes.get(node);
      } else if (typeof edge !== "undefined" && node != 1 && node != 2) {
        graph.selectEdges([edge]);
        $(".menu-entry ").hide();
        $(".edge-selection").show();
        selectedObject = edges.get(edge);
      } else {
        $(".menu-entry ").hide();
        $(".global").show();
      }
    } else {
      properties.event.stopPropagation();
      properties.event.preventDefault();
    }
  });
  graph.on("doubleClick", function(properties) {
    properties.event.preventDefault();
    let node = this.getNodeAt(properties.pointer.DOM);
    if (node) {
      node = parseInt(node);
      const service = workflow.services.find((w) => w.id === node);
      if (service.type == "workflow") {
        switchToWorkflow(node);
        $("#current-workflow")
          .val(node)
          .selectpicker("refresh");
      } else {
        showTypePanel(service.type, service.id);
      }
    }
  });
  $("#current-runtime").empty();
  $("#current-runtime").append(
    "<option value='normal'>Normal Display</option>"
  );
  $("#current-runtime").append(
    "<option value='latest'>Latest Runtime</option>"
  );
  workflowData.runtimes.forEach((runtime) => {
    $("#current-runtime").append(
      `<option value='${runtime[0]}'>${runtime[0]} (run by ${
        runtime[1]
      })</option>`
    );
  });
  $("#current-runtime").val("latest");
  $("#current-workflow").val(workflow.id);
  $("#current-runtime,#current-workflow").selectpicker("refresh");
  graph.on("dragEnd", (event) => {
    if (graph.getNodeAt(event.pointer.DOM)) savePositions();
  });
  displayWorkflowState(workflowData);
  rectangleSelection($("#network"), graph, nodes);
  currentMode = "motion";
  return graph;
}

const rectangleSelection = (container, network, nodes) => {
  const offsetLeft = container.position().left - container.offset().left;
  const offsetTop = container.position().top - container.offset().top;
  let drag = false;
  let DOMRect = {};

  const canvasify = (DOMx, DOMy) => {
    // eslint-disable-next-line new-cap
    const { x, y } = network.DOMtoCanvas({ x: DOMx, y: DOMy });
    return [x, y];
  };

  const correctRange = (start, end) =>
    start < end ? [start, end] : [end, start];

  const selectFromDOMRect = () => {
    const [sX, sY] = canvasify(DOMRect.startX, DOMRect.startY);
    const [eX, eY] = canvasify(DOMRect.endX, DOMRect.endY);
    const [startX, endX] = correctRange(sX, eX);
    const [startY, endY] = correctRange(sY, eY);
    triggerMenu = startX == endX && startY == endY;
    if (triggerMenu) return;
    network.selectNodes(
      nodes.get().reduce((selected, { id }) => {
        const { x, y } = network.getPositions(id)[id];
        return startX <= x && x <= endX && startY <= y && y <= endY
          ? selected.concat(id)
          : selected;
      }, [])
    );
  };

  container.on("mousedown", function({ which, pageX, pageY }) {
    if (which === 3) {
      Object.assign(DOMRect, {
        startX: pageX - this.offsetLeft + offsetLeft,
        startY: pageY - this.offsetTop + offsetTop,
        endX: pageX - this.offsetLeft + offsetLeft,
        endY: pageY - this.offsetTop + offsetTop,
      });
      drag = true;
    }
  });

  container.on("mousemove", function({ which, pageX, pageY }) {
    if (which === 0 && drag) {
      drag = false;
      network.redraw();
    } else if (drag) {
      Object.assign(DOMRect, {
        endX: pageX - this.offsetLeft + offsetLeft,
        endY: pageY - this.offsetTop + offsetTop,
      });
      network.redraw();
    }
  });

  container.on("mouseup", function({ which }) {
    if (which === 3) {
      drag = false;
      network.redraw();
      selectFromDOMRect();
    }
  });

  network.on("afterDrawing", (ctx) => {
    if (drag) {
      const [startX, startY] = canvasify(DOMRect.startX, DOMRect.startY);
      const [endX, endY] = canvasify(DOMRect.endX, DOMRect.endY);
      ctx.setLineDash([5]);
      ctx.strokeStyle = "rgba(78, 146, 237, 0.75)";
      ctx.strokeRect(startX, startY, endX - startX, endY - startY);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(151, 194, 252, 0.45)";
      ctx.fillRect(startX, startY, endX - startX, endY - startY);
    }
  });
};

function switchToWorkflow(workflowId, arrow) {
  if (!workflowId) return;
  if (!arrow) {
    arrowPointer++;
    arrowHistory.splice(arrowPointer, 9e9, workflowId);
  } else {
    arrowPointer += arrow == "right" ? 1 : -1;
  }
  if (arrowHistory.length >= 1 && arrowPointer !== 0) {
    $("#left-arrow").removeClass("disabled");
  } else {
    $("#left-arrow").addClass("disabled");
  }
  if (arrowPointer < arrowHistory.length - 1) {
    $("#right-arrow").removeClass("disabled");
  } else {
    $("#right-arrow").addClass("disabled");
  }
  call(`/get_workflow_state/${workflowId}/latest`, function(result) {
    workflow = result.workflow;
    graph = displayWorkflow(result);
    alertify.notify(`Workflow '${workflow.name}' displayed.`, "success", 5);
  });
}

// eslint-disable-next-line
function menu(entry) {
  action[entry]();
}

// eslint-disable-next-line
function saveWorkflowService(service, update) {
  if (update) {
    nodes.update(serviceToNode(service));
    let serviceIndex = workflow.services.findIndex((s) => s.id == service.id);
    workflow.services[serviceIndex] = service;
  } else {
    addServicesToWorkflow([service.id]);
  }
  if (service.iteration_values != "") {
    drawIterationEdge(service);
  } else {
    edges.remove(-service.id);
  }
}

// eslint-disable-next-line
function saveWorkflowEdge(edge) {
  edges.update(edgeToEdge(edge));
}

// eslint-disable-next-line
function addServicesToWorkflow(services) {
  if (!workflow) {
    alertify.notify(
      `You must create a workflow in the
    'Workflow management' page first.`,
      "error",
      5
    );
  } else {
    services = $("#services").length
      ? $("#services")
          .val()
          .join("-")
      : services;
    call(`/add_services_to_workflow/${workflow.id}/${services}`, function(
      result
    ) {
      workflow.last_modified = result.update_time;
      result.services.forEach((service, index) => {
        $("#add_services").remove();
        if (graph.findNode(service.id).length == 0) {
          nodes.add(serviceToNode(service, index));
          workflow.services.push(service);
          alertify.notify(
            `Service '${service.name}' added to the workflow.`,
            "success",
            5
          );
        } else {
          alertify.notify(
            `${service.type} '${service.name}' already in workflow.`,
            "error",
            5
          );
        }
      });
    });
  }
}

function deleteNode(id) {
  workflow.services = workflow.services.filter((n) => n.id != id);
  call(`/delete_node/${workflow.id}/${id}`, function(result) {
    workflow.last_modified = result.update_time;
    alertify.notify(
      `'${result.service.name}' deleted from the workflow.`,
      "success",
      5
    );
  });
}

function deleteLabel(label) {
  nodes.remove(label.id);
  call(`/delete_label/${workflow.id}/${label.id}`, function(updateTime) {
    delete workflow.labels[label.id];
    workflow.last_modified = updateTime;
    alertify.notify("Label removed.", "success", 5);
  });
}

function saveEdge(edge) {
  const param = `${workflow.id}/${edge.subtype}/${edge.from}/${edge.to}`;
  call(`/add_edge/${param}`, function(result) {
    workflow.last_modified = result.update_time;
    edges.add(edgeToEdge(result.edge));
    graph.addEdgeMode();
  });
}

function deleteEdge(edgeId) {
  workflow.edges = workflow.edges.filter((e) => e.id != edgeId);
  call(`/delete_edge/${workflow.id}/${edgeId}`, (updateTime) => {
    workflow.last_modified = updateTime;
  });
}

function stopWorkflow() {
  call(`/stop_workflow/${currentRuntime}`, (result) => {
    if (!result) {
      alertify.notify("The workflow is not currently running", "error", 5);
    } else {
      alertify.notify(
        "Workflow will stop after current service...",
        "success",
        5
      );
    }
  });
}

// eslint-disable-next-line
function changeSkipValue(skip) {
  const selectedNodes = graph.getSelectedNodes().filter((x) => !isNaN(x));
  call(`/skip_services/${skip}/${selectedNodes.join("-")}`, () => {
    workflow.services
      .filter((j) => selectedNodes.includes(j.id))
      .map((j) => {
        j.skip = skip == "skip";
      });
    resetDisplay();
    alertify.notify(`Services ${skip}ped`, "success", 5);
  });
}

function formatServiceTitle(service) {
  return `
    <b>Type</b>: ${service.type}<br>
    <b>Name</b>: ${service.name}
  `;
}

function serviceToNode(service, index) {
  const defaultService = ["Start", "End"].includes(service.name);
  return {
    id: service.id,
    shape:
      service.type == "workflow"
        ? "ellipse"
        : defaultService
        ? "circle"
        : "box",
    color: defaultService ? "pink" : "#D2E5FF",
    font: {
      size: 15,
      multi: "html",
      align: "left",
      bold: { color: "#000000" },
    },
    label:
      service.type == "workflow" ? `     ${service.name}     ` : service.name,
    name: service.name,
    type: service.type,
    title: formatServiceTitle(service),
    x: service.positions[workflow.name]
      ? service.positions[workflow.name][0]
      : index
      ? index * 50 - 50
      : 0,
    y: service.positions[workflow.name]
      ? service.positions[workflow.name][1]
      : index
      ? index * 50 - 200
      : 0,
  };
}

function drawLabel(id, label) {
  nodes.add({
    id: id,
    shape: "box",
    type: "label",
    font: { align: label.alignment || "center" },
    label: label.content,
    borderWidth: 0,
    color: "#FFFFFF",
    x: label.positions[0],
    y: label.positions[1],
  });
}

function drawIterationEdge(service) {
  if (!edges.get(-service.id)) {
    edges.add({
      id: -service.id,
      label: "Iteration",
      from: service.id,
      to: service.id,
      color: "black",
      arrows: { to: { enabled: true } },
    });
  }
}

function edgeToEdge(edge) {
  return {
    id: edge.id,
    label: edge.label,
    type: edge.subtype,
    from: edge.source_id,
    to: edge.destination_id,
    smooth: {
      type: "curvedCW",
      roundness:
        edge.subtype == "success" ? 0.1 : edge.subtype == "failure" ? -0.1 : 0,
    },
    color: {
      color:
        edge.subtype == "success"
          ? "green"
          : edge.subtype == "failure"
          ? "red"
          : "blue",
    },
    arrows: { to: { enabled: true } },
  };
}

function deleteSelection() {
  graph.getSelectedNodes().map((node) => deleteNode(node));
  graph.getSelectedEdges().map((edge) => deleteEdge(edge));
  graph.deleteSelected();
}

function switchMode(mode) {
  currentMode =
    mode || currentMode == "motion" ? $("#edge-type").val() : "motion";
  if (currentMode == "motion") {
    graph.addNodeMode();
    alertify.notify("Mode: node motion.", "success", 5);
  } else {
    graph.addEdgeMode();
    alertify.notify(`Mode: creation of ${currentMode} edge.`, "success", 5);
  }
  $(".dropdown-submenu a.menu-layer")
    .next("ul")
    .toggle();
}

$("#current-workflow").on("change", function() {
  if (this.value != workflow.id) switchToWorkflow(this.value);
});

$("#current-runtime").on("change", function() {
  getWorkflowState();
});

function savePositions() {
  $.ajax({
    type: "POST",
    url: `/save_positions/${workflow.id}`,
    dataType: "json",
    contentType: "application/json;charset=UTF-8",
    data: JSON.stringify(graph.getPositions(), null, "\t"),
    success: function(updateTime) {
      if (updateTime) {
        workflow.last_modified = updateTime;
      } else {
        alertify.notify("HTTP Error 403 – Forbidden", "error", 5);
      }
    },
  });
}

Object.assign(action, {
  Edit: (service) => showTypePanel(service.type, service.id),
  Run: (service) => normalRun(service.id),
  "Run with Updates": (service) =>
    showTypePanel(service.type, service.id, "run"),
  "Run Workflow": () => runWorkflow(),
  "Run Workflow with Updates": () => runWorkflow(true),
  Results: showResultsPanel,
  "Create Workflow": () => showTypePanel("workflow"),
  "Edit Workflow": () => showTypePanel("workflow", workflow.id),
  "Restart Workflow from Here": (service) =>
    showRestartWorkflowPanel(workflow, service),
  "Workflow Results": () => showResultsPanel(workflow),
  "Workflow Logs": () => showLogsPanel(workflow),
  "Add to Workflow": () => showPanel("add_services"),
  "Stop Workflow": () => stopWorkflow(),
  "Remove from Workflow": deleteSelection,
  "Create 'Success' edge": () => switchMode("success"),
  "Create 'Failure' edge": () => switchMode("failure"),
  "Create 'Prerequisite' edge": () => switchMode("prerequisite"),
  "Move Nodes": () => switchMode("motion"),
  "Create Label": () => showPanel("workflow_label"),
  "Edit Label": editLabel,
  "Edit Edge": (edge) => {
    showTypePanel("workflow_edge", edge.id);
  },
  "Delete Label": deleteLabel,
  Skip: () => changeSkipValue("skip"),
  Unskip: () => changeSkipValue("unskip"),
  "Zoom In": () => graph.zoom(0.2),
  "Zoom Out": () => graph.zoom(-0.2),
  Backward: () => switchToWorkflow(arrowHistory[arrowPointer - 1], "left"),
  Forward: () => switchToWorkflow(arrowHistory[arrowPointer + 1], "right"),
});

// eslint-disable-next-line
function createLabel() {
  const pos = mousePosition ? [mousePosition.x, mousePosition.y] : [0, 0];
  const params = `${workflow.id}/${pos[0]}/${pos[1]}`;
  fCall(`/create_label/${params}`, `#workflow_label-form`, function(result) {
    if (currLabel) {
      deleteLabel(currLabel);
      currLabel = null;
    }
    $("#workflow_label").remove();
    drawLabel(result.id, result);
    alertify.notify("Label created.", "success", 5);
  });
}

function editLabel(label) {
  showPanel("workflow_label", null, () => {
    $("#content").val(label.label);
    $("#alignment")
      .val(label.font.align)
      .selectpicker("refresh");
    currLabel = label;
  });
}

$("#network").contextMenu({
  menuSelector: "#contextMenu",
  menuSelected: function(invokedOn, selectedMenu) {
    const row = selectedMenu.text();
    action[row](selectedObject);
  },
});

function runWorkflow(withUpdates) {
  workflow.services.forEach((service) => colorService(service.id, "#D2E5FF"));
  if (withUpdates) {
    showTypePanel("workflow", workflow.id, "run");
  } else {
    normalRun(workflow.id);
  }
}

function showRestartWorkflowPanel(workflow, service) {
  createPanel(
    "restart_workflow",
    `Restart Workflow '${workflow.name}' from '${service.name}'`,
    workflow.id,
    function() {
      $("#start_services").val(service.id);
      $("#start_services").selectpicker("refresh");
      workflowRunMode(workflow, true);
    }
  );
}

// eslint-disable-next-line
function restartWorkflow() {
  fCall(`/run_service/${workflow.id}`, `#restart_workflow-form`, function(
    result
  ) {
    $(`#restart_workflow-${workflow.id}`).remove();
    runLogic(result);
  });
}

function colorService(id, color) {
  if (id != 1 && id != 2 && nodes) nodes.update({ id: id, color: color });
}

// eslint-disable-next-line
function getServiceState(id) {
  call(`/get/service/${id}`, function(service) {
    if (service.status == "Running") {
      colorService(id, "#89CFF0");
      $("#status").text("Status: Running.");
      setTimeout(() => getServiceState(id), 1500);
    } else {
      $("#status").text("Status: Idle.");
      colorService(id, service.color);
    }
  });
}

// eslint-disable-next-line
function displayWorkflowState(result) {
  if (!nodes || !edges) return;
  resetDisplay();
  if (!result.state) {
    $("#progress").hide();
  } else if (result.state.progress) {
    const progress = result.state.progress["device"];
    $("#progress").show();
    $("#progress-success").width(
      `${(progress.passed * 100) / progress.total}%`
    );
    $("#progress-failure").width(
      `${(progress.failed * 100) / progress.total}%`
    );
    $("#progress-success-span").text(progress.passed);
    $("#progress-failure-span").text(progress.failed);
    $("#status").text(`Status: ${result.state.status}`);
    const currService = result.state.current_service;
    if (currService) {
      colorService(currService.id, "#89CFF0");
    }
    if (result.state.services) {
      $.each(result.state.services, (id, state) => {
        const color = {
          true: "#32cd32",
          false: "#FF6666",
          skipped: "#D3D3D3",
        };
        if (id in nodes._data && !["1", "2"].includes(id)) {
          colorService(id, color[state.success]);
          const progress = state.progress.device;
          if (progress.total) {
            let label = `${progress.passed}/${progress.total}`;
            if (progress.failed > 0) label += ` (${progress.failed} failed)`;
            nodes.update({
              id: id,
              label: `<b>${nodes.get(id).name}</b>\nProgress: ${label}`,
            });
          }
        }
      });
    }
    if (result.state.edges) {
      $.each(result.state.edges, (id, devices) => {
        edges.update({
          id: id,
          label: `<b>${devices} DEVICE${devices == 1 ? "" : "S"}</b>`,
          font: { size: 15, multi: "html" },
        });
      });
    }
  }
}

function resetDisplay() {
  $("#progressbar").hide();
  workflow.services.forEach((service) => {
    nodes.update({
      id: service.id,
      label: service.name,
      color: service.skip ? "#D3D3D3" : "#D2E5FF",
    });
  });
  if (!edges) return;
  workflow.edges.forEach((edge) => {
    edges.update({ id: edge.id, label: edge.label });
  });
}

function getWorkflowState(periodic) {
  const runtime = $("#current-runtime").val();
  const url = runtime ? `/${runtime}` : "";
  if (userIsActive && workflow && workflow.id) {
    call(`/get_workflow_state/${workflow.id}${url}`, function(result) {
      if (result.workflow.id != workflow.id) return;
      currentRuntime = result.runtime;
      if (result.workflow.last_modified !== workflow.last_modified) {
        displayWorkflow(result);
      } else {
        displayWorkflowState(result);
      }
    });
  }
  if (periodic) setTimeout(() => getWorkflowState(true), 4000);
}

(function() {
  $("#left-arrow,#right-arrow").addClass("disabled");
  $("#edge-type").on("change", function() {
    switchMode(this.value);
  });
  call("/get_all/workflow", function(workflows) {
    workflows.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < workflows.length; i++) {
      $("#current-workflow").append(
        `<option value="${workflows[i].id}">${workflows[i].name}</option>`
      );
    }
    if (workflow) {
      $("#current-workflow").val(workflow.id);
      switchToWorkflow(workflow.id);
    } else {
      workflow = $("#current-workflow").val();
      if (workflow) {
        switchToWorkflow(workflow);
      } else {
        alertify.notify(
          `You must create a workflow in the
        'Workflow management' page first.`,
          "error",
          5
        );
      }
    }
    $("#current-workflow,#current-runtimes").selectpicker({
      liveSearch: true,
    });
    $("#edge-type").selectpicker();
    getWorkflowState(true);
  });
})();
