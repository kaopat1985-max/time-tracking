let state = {
  projects: [],
  tasks: [],
  selectedProjectId: 1,
  selectedTaskId: null,
  currentTimer: null,
  paused: false,
  pausedElapsed: 0
};

const dom = {
  projectSelect: document.getElementById('projectSelect'),
  taskSelect: document.getElementById('taskSelect'),
  startSwitchBtn: document.getElementById('startSwitchBtn'),
  pauseResumeBtn: document.getElementById('pauseResumeBtn'),
  stopBtn: document.getElementById('stopBtn'),
  projectNameInput: document.getElementById('projectNameInput'),
  taskNameInput: document.getElementById('taskNameInput'),
  addProjectBtn: document.getElementById('addProjectBtn'),
  addTaskBtn: document.getElementById('addTaskBtn'),
  editProjectBtn: document.getElementById('editProjectBtn'),
  deleteProjectBtn: document.getElementById('deleteProjectBtn'),
  editTaskBtn: document.getElementById('editTaskBtn'),
  deleteTaskBtn: document.getElementById('deleteTaskBtn'),
  currentTaskName: document.getElementById('currentTaskName'),
  elapsedTime: document.getElementById('elapsedTime'),
  statusMessage: document.getElementById('statusMessage'),
  summaryTableBody: document.querySelector('#summaryTable tbody'),
  summaryMode: document.querySelectorAll('input[name="summaryMode"]')
};

async function init() {
  await DB.openDB();
  await refreshData();
  setupListeners();
  startTimerLoop();
}

async function refreshData() {
  state.projects = await DB.getProjects();
  state.tasks = await DB.getTasks();
  if (!state.projects.find(p => p.id === state.selectedProjectId)) {
    state.selectedProjectId = 1;
  }
  populateProjectSelect();
  populateTaskSelect();
  updateSummary();
  updateManageButtons();
}

function populateProjectSelect() {
  dom.projectSelect.innerHTML = '';
  state.projects.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    if (p.id === state.selectedProjectId) option.selected = true;
    dom.projectSelect.append(option);
  });
}

function populateTaskSelect() {
  dom.taskSelect.innerHTML = '';
  const tasks = state.tasks.filter(t => t.projectId === state.selectedProjectId);
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '-- choose task --';
  dom.taskSelect.append(emptyOpt);
  tasks.forEach(t => {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.name;
    if (t.id === state.selectedTaskId) option.selected = true;
    dom.taskSelect.append(option);
  });
}

function updateManageButtons() {
  const p = state.projects.find(p => p.id === state.selectedProjectId);
  dom.editProjectBtn.disabled = !p || p.fixed;
  dom.deleteProjectBtn.disabled = !p || p.fixed;

  const t = state.tasks.find(t => t.id === Number(state.selectedTaskId));
  dom.editTaskBtn.disabled = !t;
  dom.deleteTaskBtn.disabled = !t;
}

function showStatus(msg, danger=false) {
  dom.statusMessage.textContent = msg;
  dom.statusMessage.style.color = danger ? 'var(--danger)' : '#374151';
}

function startTimerLoop() {
  setInterval(() => {
    if (state.currentTimer && !state.paused) {
      const elapsed = getElapsedMinutes();
      dom.elapsedTime.textContent = TimeUtils.formatHM(elapsed);
    }
  }, 1000);
}

function getElapsedMinutes() {
  if (!state.currentTimer) return 0;
  const now = TimeUtils.getCurrentTimeObj();
  const base = state.currentTimer;
  let duration = TimeUtils.minuteDiff(base.start, now);
  duration = Math.max(0, duration + state.pausedElapsed);
  return duration;
}

async function setCurrentProject(id) {
  state.selectedProjectId = Number(id);
  await refreshData();
}

async function setCurrentTask(id) {
  const resolved = Number(id);
  if (!resolved) {
    state.selectedTaskId = null;
    return;
  }
  state.selectedTaskId = resolved;
  updateManageButtons();
}

async function startOrSwitchTask() {
  const selectedTask = state.tasks.find(t => t.id === Number(dom.taskSelect.value));
  if (!selectedTask) { showStatus('Please select task first.', true); return; }

  if (state.currentTimer && state.currentTimer.taskId === selectedTask.id) {
    showStatus('Already tracking this task.', false);
    return;
  }

  if (state.currentTimer) {
    await saveCurrentTimerEntry(false);
  }

  state.currentTimer = {
    taskId: selectedTask.id,
    start: TimeUtils.getCurrentTimeObj()
  };
  state.paused = false;
  state.pausedElapsed = 0;
  dom.pauseResumeBtn.disabled = false;
  dom.stopBtn.disabled = false;
  updateCurrentTaskDisplay();
  showStatus(`Started task '${selectedTask.name}'.`);
  updateSummary();
}

function updateCurrentTaskDisplay() {
  if (!state.currentTimer) {
    dom.currentTaskName.textContent = 'No active task';
    dom.elapsedTime.textContent = '00:00';
    dom.pauseResumeBtn.textContent = 'Pause';
    return;
  }
  const task = state.tasks.find(t => t.id === state.currentTimer.taskId);
  const project = state.projects.find(p => p.id === task.projectId);
  dom.currentTaskName.textContent = project ? `${project.name} > ${task.name}` : task.name;
  dom.elapsedTime.textContent = TimeUtils.formatHM(getElapsedMinutes());
  dom.pauseResumeBtn.textContent = state.paused ? 'Resume' : 'Pause';
}

async function saveCurrentTimerEntry(isEndToday = true) {
  if (!state.currentTimer) return;
  const stopTime = TimeUtils.getCurrentTimeObj();
  const duration = TimeUtils.minuteDiff(state.currentTimer.start, stopTime);
  const finalDuration = duration + state.pausedElapsed;

  if (finalDuration > 1) {
    await DB.addTimeEntry({
      taskId: state.currentTimer.taskId,
      startDate: state.currentTimer.start.date,
      startHour: state.currentTimer.start.hour,
      startMinute: state.currentTimer.start.minute,
      endDate: stopTime.date,
      endHour: stopTime.hour,
      endMinute: stopTime.minute,
      durationMinutes: finalDuration,
      createdAt: new Date().toISOString()
    });
    showStatus(`Recorded ${TimeUtils.formatHM(finalDuration)} for task.`);
  } else {
    showStatus('Skipped entry <= 1 minute.', true);
  }

  state.currentTimer = null;
  state.paused = false;
  state.pausedElapsed = 0;
  dom.pauseResumeBtn.disabled = true;
  dom.stopBtn.disabled = true;
  updateCurrentTaskDisplay();
  await updateSummary();
}

async function pauseResume() {
  if (!state.currentTimer) return;
  if (state.paused) {
    state.currentTimer.start = TimeUtils.getCurrentTimeObj();
    state.paused = false;
    showStatus('Resumed timer.');
  } else {
    state.pausedElapsed = getElapsedMinutes();
    state.paused = true;
    showStatus('Paused timer.');
  }
  updateCurrentTaskDisplay();
}

async function stopTask() {
  if (!state.currentTimer) return;
  await saveCurrentTimerEntry();
}

function validateName(name) {
  return name && name.trim().length > 0 && name.trim().length <= 50;
}

async function addProject() {
  const name = dom.projectNameInput.value.trim();
  if (!validateName(name)) { showStatus('Project name required, max 50 chars.', true); return; }
  try { await DB.addProject(name); dom.projectNameInput.value = ''; showStatus('Project added.'); await refreshData(); }
  catch (error) { showStatus(error.message, true); }
}

async function addTask() {
  const name = dom.taskNameInput.value.trim();
  if (!validateName(name)) { showStatus('Task name required, max 50 chars.', true); return; }
  let projectId = state.selectedProjectId || 1;
  try { await DB.addTask(name, projectId); dom.taskNameInput.value = ''; showStatus('Task added.'); await refreshData(); }
  catch(error){ showStatus(error.message,true);}  
}

async function editProject() {
  const project = state.projects.find(p => p.id === state.selectedProjectId);
  if (!project || project.fixed) return;
  const name = prompt('Rename project', project.name);
  if (!name) return;
  if (!validateName(name.trim())) { showStatus('Invalid project name.', true); return; }
  await DB.updateProject(project.id, name.trim());
  showStatus('Project renamed.');
  await refreshData();
}

async function deleteProject() {
  const project = state.projects.find(p => p.id === state.selectedProjectId);
  if (!project || project.fixed) return;
  if (!confirm('Delete project and all its tasks?')) return;
  await DB.deleteProject(project.id);
  showStatus('Project deleted.');
  state.selectedProjectId = 1;
  await refreshData();
}

async function editTask() {
  const task = state.tasks.find(t => t.id === Number(state.selectedTaskId));
  if (!task) return;
  const name = prompt('Rename task', task.name);
  if (!name) return;
  if (!validateName(name.trim())) { showStatus('Invalid task name.', true); return; }
  await DB.updateTask(task.id, name.trim());
  showStatus('Task renamed.');
  await refreshData();
}

async function deleteTask() {
  const task = state.tasks.find(t => t.id === Number(state.selectedTaskId));
  if (!task) return;
  if (!confirm('Delete task?')) return;
  await DB.deleteTask(task.id);
  showStatus('Task deleted.');
  state.selectedTaskId = null;
  await refreshData();
}

function getSummaryMode() {
  const checked = Array.from(dom.summaryMode).find(r => r.checked);
  return checked ? checked.value : 'task';
}

async function updateSummary() {
  const date = TimeUtils.getLocalBoundaryDate();
  const entries = await DB.getTimeEntriesForDate(date);
  const tasksById = Object.fromEntries(state.tasks.map(t=>[t.id,t]));
  const projsById = Object.fromEntries(state.projects.map(p=>[p.id,p]));

  const mode = getSummaryMode();
  const map = new Map();

  entries.forEach(e => {
    const task = tasksById[e.taskId];
    if (!task) return;
    const project = projsById[task.projectId];
    const label = mode === 'project'
      ? (project?.name || 'Unknown')
      : mode === 'projectTask'
        ? `${project?.name || 'Unknown'} > ${task.name}`
        : task.name;
    if (!map.has(label)) map.set(label, 0);
    map.set(label, map.get(label) + e.durationMinutes);
  });

  const rows = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  dom.summaryTableBody.innerHTML = '';
  rows.forEach(([label, minutes]) => {
    const tr = document.createElement('tr');
    const th = document.createElement('td'); th.textContent = label;
    const td = document.createElement('td'); td.textContent = TimeUtils.formatHM(minutes);
    tr.append(th, td); dom.summaryTableBody.append(tr);
  });
}

function setupListeners() {
  dom.projectSelect.addEventListener('change', async e => setCurrentProject(e.target.value));
  dom.taskSelect.addEventListener('change', async e => setCurrentTask(e.target.value));
  dom.startSwitchBtn.addEventListener('click', startOrSwitchTask);
  dom.pauseResumeBtn.addEventListener('click', pauseResume);
  dom.stopBtn.addEventListener('click', stopTask);

  dom.addProjectBtn.addEventListener('click', addProject);
  dom.addTaskBtn.addEventListener('click', addTask);
  dom.editProjectBtn.addEventListener('click', editProject);
  dom.deleteProjectBtn.addEventListener('click', deleteProject);
  dom.editTaskBtn.addEventListener('click', editTask);
  dom.deleteTaskBtn.addEventListener('click', deleteTask);

  dom.summaryMode.forEach(el => el.addEventListener('change', updateSummary));
}

init().then(() => showStatus('App ready.')).catch(err => showStatus(err.message, true));
