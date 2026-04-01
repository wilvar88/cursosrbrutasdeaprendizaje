/**
 * Código para Google Apps Script (Código.gs)
 * Este script lee las hojas del Google Sheet, calcula los KPIs y devuelve un JSON
 * para que tu Dashboard lo consuma. Además, incluye análisis con Gemini AI.
 */

var EXTRA_USERS_KEY_GS = 'rb_extra_users_gs';

/** Devuelve la lista de usuarios extra guardados en Properties */
function getExtraUsersFromProps() {
  var raw = PropertiesService.getScriptProperties().getProperty(EXTRA_USERS_KEY_GS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e) { return []; }
}

/** Guarda la lista de usuarios extra en Properties */
function saveExtraUsersToProps(users) {
  PropertiesService.getScriptProperties().setProperty(EXTRA_USERS_KEY_GS, JSON.stringify(users));
}

function doGet(e) {
  return handleResponse();
}

/**
 * doPost: Gestiona usuarios extra (agregar / eliminar).
 * Espera un JSON con: { action: 'add_user'|'remove_user', user: {...} | password: '...' }
 */
function doPost(e) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST',
    'Content-Type': 'application/json'
  };
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var users = getExtraUsersFromProps();

    if (action === 'add_user') {
      var newUser = body.user;
      // Verificar que no exista esa contraseña
      var alreadyExists = users.some(function(u) { return u.password === newUser.password; });
      if (alreadyExists) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Esa contraseña ya existe.' })).setMimeType(ContentService.MimeType.JSON);
      }
      users.push(newUser);
      saveExtraUsersToProps(users);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, users: users })).setMimeType(ContentService.MimeType.JSON);

    } else if (action === 'remove_user') {
      var pwToRemove = body.password;
      users = users.filter(function(u) { return u.password !== pwToRemove; });
      saveExtraUsersToProps(users);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, users: users })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Acción desconocida.' })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleResponse() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = spreadsheet.getSheets();
  
  var allCoursesData = {};
  var allAreasData = {};
  var allFeedbacks = [];
  var totalAttendees = 0;
  var globalFinished = 0;
  var globalApproved = 0;
  var globalStarted = 0;
  var globalRatingsCount = 0;
  var globalRatingsSum = 0;
  // Contadores por género
  var genderStats = {
    Masculino: { count: 0, sum: 0, enrolled: 0 },
    Femenino:  { count: 0, sum: 0, enrolled: 0 }
  };

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    var headers = data[0];
    var colIndex = {};
    for (var h = 0; h < headers.length; h++) {
       if(headers[h]) colIndex[headers[h].toString().trim()] = h;
    }
    
    if (colIndex['Curso'] === undefined) continue;

    var participantColName = Object.keys(colIndex).find(function(k) { return k.match(/nombre|colaborador|participante|alumno|empleado/i); });
    var areaColName = Object.keys(colIndex).find(function(k) { return k.toLowerCase() === 'área' || k.toLowerCase() === 'area'; });
    var generoColName = Object.keys(colIndex).find(function(k) { return k.toLowerCase() === 'género' || k.toLowerCase() === 'genero' || k.toLowerCase() === 'sexo' || k.toLowerCase() === 'género'; });

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var cursoName = row[colIndex['Curso']];
      if (!cursoName) continue;
      
      var areaName = areaColName ? row[colIndex[areaColName]].toString().trim() : sheet.getName();
      if (!areaName) areaName = "Sin Área";

      if (!allAreasData[areaName]) {
        allAreasData[areaName] = {
          name: areaName,
          total_enrolled: 0,
          not_started: 0,
          approved: 0,
          finished: 0,
          participants: []
        };
      }

      var estadoColaborador = colIndex['Estado'] !== undefined ? row[colIndex['Estado']] : "Activo";
      var estadoAprobacion = colIndex['Estado de Aprobación'] !== undefined ? row[colIndex['Estado de Aprobación']].toString().trim() : "";
      var participantName = participantColName ? row[colIndex[participantColName]] : ("Participante " + r);
      
      // Contar inscritos por género (todos los registros, hayan valorado o no)
      var generoRowRaw = generoColName ? row[colIndex[generoColName]].toString().trim().toLowerCase() : "";
      if (generoRowRaw.indexOf('f') !== -1 || generoRowRaw === 'mujer' || generoRowRaw === 'femenino') {
        genderStats.Femenino.enrolled++;
      } else if (generoRowRaw.indexOf('m') !== -1 || generoRowRaw === 'hombre' || generoRowRaw === 'masculino') {
        genderStats.Masculino.enrolled++;
      }
      
      if (!allCoursesData[cursoName]) {
         allCoursesData[cursoName] = {
            name: cursoName, category: areaName, total_enrolled: 0, not_started: 0, approved: 0, finished: 0, ratings_count: 0, ratings_sum: 0, activos: 0, inactivos: 0
         };
      }
      
      var c = allCoursesData[cursoName];
      var a = allAreasData[areaName];
      
      c.total_enrolled++;
      a.total_enrolled++;
      totalAttendees++;

      if (estadoColaborador === "Activo") { c.activos++; } else { c.inactivos++; }

      var lowerEstado = estadoAprobacion.toLowerCase().trim();

      // Detectar "Aprobado" de forma exacta, sin incluir "No Aprobado"
      var esAprobado = (lowerEstado === 'aprobado') ||
                       (lowerEstado.indexOf('aprobado') !== -1 && lowerEstado.indexOf('no aprobado') === -1 && !lowerEstado.match(/^no\s/));

      if (lowerEstado.indexOf("inscrit") !== -1 || lowerEstado === "") {
        c.not_started++;
        a.not_started++;
      } else {
        if (esAprobado) {
          c.approved++; a.approved++;
          c.finished++; a.finished++;
        } else if (lowerEstado.indexOf("reproba") !== -1 || lowerEstado.indexOf("finaliz") !== -1) {
          c.finished++; a.finished++;
        }
      }

      a.participants.push({
         name: participantName,
         course: cursoName,
         status: estadoAprobacion
      });

      var valoracion = colIndex['Valoración'] !== undefined ? row[colIndex['Valoración']] : "";
      if (valoracion !== "" && valoracion != null && !isNaN(valoracion)) {
         var valFloat = parseFloat(valoracion);
         c.ratings_count++;
         c.ratings_sum += valFloat;
         globalRatingsCount++;
         globalRatingsSum += valFloat;

         // Acumular por género
         var generoRaw = generoColName ? row[colIndex[generoColName]].toString().trim().toLowerCase() : "";
         if (generoRaw.indexOf('f') !== -1 || generoRaw === 'mujer' || generoRaw === 'femenino') {
           genderStats.Femenino.count++;
           genderStats.Femenino.sum += valFloat;
         } else if (generoRaw.indexOf('m') !== -1 || generoRaw === 'hombre' || generoRaw === 'masculino') {
           genderStats.Masculino.count++;
           genderStats.Masculino.sum += valFloat;
         }
         
         var comentario = colIndex['Comentario'] !== undefined ? row[colIndex['Comentario']] : "";
         if (comentario && comentario.toString().length > 3) {
            allFeedbacks.push("Área " + areaName + " | Curso: " + cursoName + " | Valoración: " + valoracion + " | Comentario: " + comentario);
         }
      }
    }
  }

  var coursesOutput = [];
  for (var key in allCoursesData) {
     var c = allCoursesData[key];
     var started = c.total_enrolled - c.not_started;
     c.participation = c.total_enrolled > 0 ? (started / c.total_enrolled) * 100 : 0;
     c.approval = c.total_enrolled > 0 ? (c.approved / c.total_enrolled) * 100 : 0;
     c.feedback_participation = c.total_enrolled > 0 ? (c.ratings_count / c.total_enrolled) * 100 : 0;
     c.average_rating = c.ratings_count > 0 ? (c.ratings_sum / c.ratings_count) : 0;
     c.enrolled = c.total_enrolled; 
     
     globalStarted += started;
     globalApproved += c.approved; // Total de aprobados (independiente del estado activo/inactivo)
     globalFinished += c.finished;
     coursesOutput.push(c);
  }

  var areasOutput = [];
  for (var key in allAreasData) {
     var a = allAreasData[key];
     var aStarted = a.total_enrolled - a.not_started;
     a.participation = a.total_enrolled > 0 ? (aStarted / a.total_enrolled) * 100 : 0;
     a.approval = a.total_enrolled > 0 ? (a.approved / a.total_enrolled) * 100 : 0;
     a.enrolled = a.total_enrolled;
     areasOutput.push(a);
  }

  var globalAvgRating = globalRatingsCount > 0 ? (globalRatingsSum / globalRatingsCount) : 0;
  var globalRatingParticipation = totalAttendees > 0 ? (globalRatingsCount / totalAttendees) * 100 : 0;

  var lastUpdatedStr = "";
  try {
    var file = DriveApp.getFileById(spreadsheet.getId());
    lastUpdatedStr = Utilities.formatDate(file.getLastUpdated(), "GMT-5", "dd/MM/yyyy HH:mm");
  } catch(e) {
    lastUpdatedStr = Utilities.formatDate(new Date(), "GMT-5", "dd/MM/yyyy HH:mm") + " (Local)";
  }

  // Leer Análisis de Valoración desde la Hoja creada por el usuario
  var geminiAnalysis = { positive: "El administrador no ha registrado el análisis aún.", improvement: "El administrador no ha registrado el análisis aún." };
  var insightsSheet = spreadsheet.getSheetByName("Analisis de Valoración");
  
  if (insightsSheet) {
    var positiveText = insightsSheet.getRange("A2").getValue();
    var improvementText = insightsSheet.getRange("B2").getValue();
    
    if (positiveText || improvementText) {
      geminiAnalysis = {
         positive: positiveText || "No hay comentarios positivos registrados.",
         improvement: improvementText || "No hay oportunidades de mejora registradas."
      };
    }
  }

  var response = {
    kpis: {
      total_courses: coursesOutput.length,
      total_areas: areasOutput.length,
      total_attendees: totalAttendees,
      global_started: globalStarted,
      global_approved: globalApproved,
      participation_rate: totalAttendees > 0 ? (globalStarted / totalAttendees) * 100 : 0,
      approval_rate: totalAttendees > 0 ? (globalApproved / totalAttendees) * 100 : 0,
      average_rating: globalAvgRating,
      ratings_count: globalRatingsCount,
      rating_participation: globalRatingParticipation,
      last_updated: lastUpdatedStr,
      download_url: "https://docs.google.com/spreadsheets/d/" + spreadsheet.getId() + "/export?format=xlsx&gid=" + (spreadsheet.getSheets().length > 0 ? spreadsheet.getSheets()[0].getSheetId() : 0)
    },
    courses: coursesOutput,
    areas: areasOutput,
    ai_insights: geminiAnalysis,
    extra_users: getExtraUsersFromProps(),
    gender_stats: {
      femenino: {
        count: genderStats.Femenino.count,
        avg: genderStats.Femenino.count > 0 ? (genderStats.Femenino.sum / genderStats.Femenino.count) : 0,
        pct: globalRatingsCount > 0 ? (genderStats.Femenino.count / globalRatingsCount) * 100 : 0,
        enrolled: genderStats.Femenino.enrolled,
        participation_rate: genderStats.Femenino.enrolled > 0 ? (genderStats.Femenino.count / genderStats.Femenino.enrolled) * 100 : 0
      },
      masculino: {
        count: genderStats.Masculino.count,
        avg: genderStats.Masculino.count > 0 ? (genderStats.Masculino.sum / genderStats.Masculino.count) : 0,
        pct: globalRatingsCount > 0 ? (genderStats.Masculino.count / globalRatingsCount) * 100 : 0,
        enrolled: genderStats.Masculino.enrolled,
        participation_rate: genderStats.Masculino.enrolled > 0 ? (genderStats.Masculino.count / genderStats.Masculino.enrolled) * 100 : 0
      }
    }
  };
  
  var jsonParams = JSON.stringify(response);
  return ContentService.createTextOutput(jsonParams).setMimeType(ContentService.MimeType.JSON);
}


