const DATA_PATHS = {
  students: "data/students.json",
  labs: "data/labs.json",
  grades: "data/grades.json"
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGithub(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(path, fallback) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`No se pudo cargar ${path}`, error);
    return fallback;
  }
}

function buildStudentRows(students, grades) {
  const rows = students.map(student => ({
    id: student.id,
    name: student.name,
    github: student.github,
    grades: {}
  }));

  const byGithub = new Map();
  const byName = new Map();

  rows.forEach(row => {
    const github = normalizeGithub(row.github);
    if (github && github !== "pendiente") byGithub.set(github, row);
    byName.set(normalizeText(row.name), row);
  });

  grades.forEach(grade => {
    const gradeGithub = normalizeGithub(grade.githubUser);
    const gradeName = normalizeText(grade.studentName);

    let row = byGithub.get(gradeGithub) || byName.get(gradeName);

    if (!row) {
      row = rows.find(candidate => {
        const candidateName = normalizeText(candidate.name);
        return candidateName.includes(gradeName) || gradeName.includes(candidateName);
      });
    }

    if (!row) {
      row = {
        id: `extra-${gradeGithub || gradeName}`,
        name: grade.studentName,
        github: grade.githubUser,
        grades: {},
        extra: true
      };
      rows.push(row);
    }

    if (!row.github || normalizeGithub(row.github) === "pendiente") {
      row.github = grade.githubUser;
    }

    const current = row.grades[grade.labId];
    if (!current || new Date(grade.date) > new Date(current.date)) {
      row.grades[grade.labId] = grade;
    }
  });

  return rows;
}

function renderSummary(students, labs, grades) {
  const summary = document.getElementById("summary");
  const submittedGithubUsers = new Set(grades.map(g => normalizeGithub(g.githubUser)).filter(Boolean));
  const approved = grades.filter(g => String(g.status).toLowerCase().includes("aprobado")).length;
  const average = grades.length
    ? Math.round(grades.reduce((total, grade) => total + Number(grade.score || 0), 0) / grades.length)
    : 0;

  summary.innerHTML = `
    <article class="metric"><span>${students.length}</span><p>Estudiantes registrados</p></article>
    <article class="metric"><span>${labs.length}</span><p>Laboratorios publicados</p></article>
    <article class="metric"><span>${grades.length}</span><p>Entregas procesadas</p></article>
    <article class="metric"><span>${submittedGithubUsers.size}</span><p>Usuarios con entrega</p></article>
    <article class="metric"><span>${approved}</span><p>Entregas aprobadas</p></article>
    <article class="metric"><span>${average}</span><p>Promedio general</p></article>
  `;
}

function renderTableHeader(labs) {
  const headerRow = document.querySelector("thead tr");
  headerRow.innerHTML = `
    <th>Estudiante</th>
    <th>GitHub</th>
    ${labs.map(lab => `<th>${escapeHtml(lab.title || lab.id)}</th>`).join("")}
    <th>Última fecha</th>
  `;
}

function renderGradesTable(rows, labs) {
  const tbody = document.getElementById("gradesTable");

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${labs.length + 3}">No hay estudiantes registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const labCells = labs.map(lab => {
      const grade = row.grades[lab.id];
      if (!grade) return `<td><span class="status pending">Pendiente</span></td>`;

      const statusClass = Number(grade.score) >= 70 ? "approved" : "failed";
      return `
        <td>
          <strong>${Number(grade.score).toFixed(0)}</strong><br>
          <span class="status ${statusClass}">${escapeHtml(grade.status)}</span>
        </td>
      `;
    }).join("");

    const latestDate = Object.values(row.grades)
      .map(grade => grade.date)
      .filter(Boolean)
      .sort()
      .at(-1) || "-";

    return `
      <tr>
        <td>${escapeHtml(row.name)}${row.extra ? " <small>(no estaba en students.json)</small>" : ""}</td>
        <td>${escapeHtml(row.github || "pendiente")}</td>
        ${labCells}
        <td>${escapeHtml(latestDate)}</td>
      </tr>
    `;
  }).join("");
}

async function loadDashboard() {
  const [students, labs, grades] = await Promise.all([
    fetchJson(DATA_PATHS.students, []),
    fetchJson(DATA_PATHS.labs, []),
    fetchJson(DATA_PATHS.grades, [])
  ]);

  const rows = buildStudentRows(students, grades);

  renderSummary(students, labs, grades);
  renderTableHeader(labs);
  renderGradesTable(rows, labs);
}

loadDashboard();
