const fs = require('fs');
const path = require('path');
const Evaluation = require('../models/Evaluation');

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateES(date) {
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    const d = new Date(date);
    return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatDateShort(date) {
    const d = new Date(date);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function nivelClase(pct) {
    if (pct >= 80) return 'badge-success';
    if (pct >= 60) return 'badge-warning';
    return 'badge-danger';
}

function nivelTexto(pct) {
    if (pct >= 80) return 'Ideal';
    if (pct >= 60) return 'Alerta';
    return 'Riesgo';
}

function barClase(pct) {
    if (pct >= 80) return 'perf-bar-ideal';
    if (pct >= 60) return 'perf-bar-alerta';
    return 'perf-bar-riesgo';
}

function nivelColor(pct) {
    if (pct >= 80) return '#16a34a';
    if (pct >= 60) return '#b45309';
    return '#dc2626';
}

const META = 80;

// ── Gráfica de dona SVG ────────────────────────────────────────────────────

function generarDonaFull(pct) {
    const r = 50, cx = 70, cy = 70, stroke = 16;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const gap  = circ - dash;
    const strokeColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
    const textColor   = pct >= 80 ? '#16a34a' : pct >= 60 ? '#b45309' : '#dc2626';

    // Marca de meta al 80%
    const metaAngle = (80 / 100) * 2 * Math.PI - Math.PI / 2;
    const mx1 = cx + (r - stroke / 2) * Math.cos(metaAngle);
    const my1 = cy + (r - stroke / 2) * Math.sin(metaAngle);
    const mx2 = cx + (r + stroke / 2) * Math.cos(metaAngle);
    const my2 = cy + (r + stroke / 2) * Math.sin(metaAngle);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${stroke}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="${stroke}"
            stroke-linecap="round"
            stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle"
            font-family="Inter,Arial,sans-serif" font-size="20" font-weight="800" fill="${textColor}">${pct}%</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle"
            font-family="Inter,Arial,sans-serif" font-size="9" fill="#64748b">cumplimiento</text>
        <line x1="${mx1.toFixed(2)}" y1="${my1.toFixed(2)}" x2="${mx2.toFixed(2)}" y2="${my2.toFixed(2)}"
            stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
        <text x="${cx}" y="132" text-anchor="middle"
            font-family="Inter,Arial,sans-serif" font-size="8" fill="#64748b">▏ meta: ${META}%</text>
    </svg>`;
}

// ── Cálculo de porcentaje ──────────────────────────────────────────────────

function valorNivel(val) {
    if (!val) return null;
    const v = val.toLowerCase();
    if (v.includes('ideal') || v.includes('totalmente')) return 1;
    if (v.includes('alerta') || v.includes('parcial'))   return 0.5;
    if (v.includes('riesgo') || v === 'no')              return 0;
    return null;
}

function calcularPorcentaje(ev) {
    if (ev.calificacionTotal !== undefined && ev.calificacionTotal !== null && Number(ev.calificacionTotal) > 0) {
        return Math.round(Number(ev.calificacionTotal));
    }

    if (ev.calificacionesDetalle && typeof ev.calificacionesDetalle === 'object') {
        const vals = Object.values(ev.calificacionesDetalle).map(valorNivel).filter(v => v !== null);
        if (vals.length > 0) {
            return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
        }
    }

    const proceso = ev.datosGenerales?.procesoEvaluado || '';
    let campos = [];

    if (proceso === 'Recuperación') {
        const ri = ev.recuperacionIndividuales || {};
        const camposInd = [ri.recuperacionPactadoInd, ri.fichaCerradaInd, ri.registroHojaControlInd, ri.recibosInd];
        const validosInd = camposInd.map(valorNivel).filter(v => v !== null);
        if (validosInd.length > 0) {
            return Math.round((validosInd.reduce((a, b) => a + b, 0) / validosInd.length) * 100);
        }

        const r = ev.recuperacion || {};
        campos = [r.puntualidadAsesor, r.asistenciaGrupo, r.recuperacionPactado,
                  r.fichaCerrada, r.registroHojaControl, r.cotejoHojaControl, r.recibos];
    } else if (proceso === 'Renovación') {
        const r = ev.renovacion || {};
        campos = [r.documentacionSemana, r.asesoriaCliente, r.expedientesCompletos, r.valoracionRiesgo];
    } else if (proceso === 'Cobranza') {
        const c = ev.cobranza || {};
        campos = [c.diasAtraso, c.estrategiasASEC || c.estrategiasAsec, c.acciones, c.saldoVencido];
    } else if (proceso === 'Desembolso') {
        const d = ev.desembolsoCredito?.actividadesPrevias || {};
        campos = [d.dinamicaPresentacion, d.educacionFinanciera, d.devolucionGarantias,
                  d.comentariosReglamento, d.comentariosContrato, d.pagoSancionesSolidarios];
    }

    const validos = campos.map(valorNivel).filter(v => v !== null);
    if (validos.length === 0) return 0;
    return Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 100);
}

// ── Extracción de observaciones de una evaluación ─────────────────────────

function extraerNombreGrupo(dg) {
    if (!dg) return 'Sin nombre';
    if (typeof dg.grupo === 'string' && dg.grupo.trim()) return dg.grupo.trim();
    if (dg.grupo?.nombre && dg.grupo.nombre.trim()) return dg.grupo.nombre.trim();
    if (typeof dg.clienteIndividual === 'string' && dg.clienteIndividual.trim()) return dg.clienteIndividual.trim();
    if (dg.clienteIndividual?.nombre && dg.clienteIndividual.nombre.trim()) return dg.clienteIndividual.nombre.trim();
    return 'Sin nombre';
}

function esCreditoIndividual(ev) {
    if (!ev) return false;
    const dg = ev.datosGenerales || {};
    if (ev.tipoCredito && String(ev.tipoCredito).toLowerCase().includes('individual')) return true;
    if (dg.tipoCredito && String(dg.tipoCredito).toLowerCase().includes('individual')) return true;
    if (dg.clienteIndividual?.nombre && String(dg.clienteIndividual.nombre).trim().length > 0) return true;
    if (typeof dg.clienteIndividual === 'string' && dg.clienteIndividual.trim().length > 0) return true;
    return false;
}

/**
 * Devuelve el texto de observaciones/incidencias de una evaluación.
 * Prioriza campos más específicos y no repite el mismo texto.
 */
function extraerObservacion(ev) {
    const candidatos = [
        ev.observacionesGenerales,
        ev.datosGenerales?.observaciones,
        ev.recuperacion?.observacionesRecuperacion,
        ev.renovacion?.observacionesRenovacion,
        ev.cobranza?.observacionesCobranza,
        ev.desembolsoCredito?.observacionesDesembolso,
        ev.cierreCiclo?.incidenciasCierre,
        ev.cierreCiclo?.incidencias,
    ];

    const vistos = new Set();
    const resultado = [];

    for (const txt of candidatos) {
        if (txt && txt.trim() && !vistos.has(txt.trim())) {
            vistos.add(txt.trim());
            resultado.push(txt.trim());
        }
    }

    return resultado.join(' | ');
}

// ── Conteo de parámetros ───────────────────────────────────────────────────

function contarParametros(evaluaciones, proceso) {
    const definiciones = {
        'Recuperación': {
            campos: [
                { key: 'puntualidadAsesor',      label: 'Puntualidad del asesor' },
                { key: 'asistenciaGrupo',         label: 'Asistencia del grupo' },
                { key: 'recuperacionPactado',     label: 'Recuperación pactado' },
                { key: 'fichaCerrada',            label: 'Ficha cerrada' },
                { key: 'registroHojaControl',     label: 'Registro hoja de control' },
                { key: 'cotejoHojaControl',       label: 'Cotejo hoja de control' },
                { key: 'recibos',                 label: 'Recibos' }
            ],
            seccion: 'recuperacion',
            niveles: ['Ideal', 'Alerta', 'Riesgo']
        },
        'Renovación': {
            campos: [
                { key: 'documentacionSemana',  label: 'Documentación semana' },
                { key: 'asesoriaCliente',      label: 'Asesoría al cliente' },
                { key: 'expedientesCompletos', label: 'Expedientes completos' },
                { key: 'valoracionRiesgo',     label: 'Valoración de riesgo' }
            ],
            seccion: 'renovacion',
            niveles: ['Ideal', 'Alerta', 'Riesgo']
        },
        'Cobranza': {
            campos: [
                { key: 'diasAtraso',      label: 'Días de atraso' },
                { key: 'estrategiasASEC', label: 'Estrategias ASEC', altKey: 'estrategiasAsec' },
                { key: 'acciones',        label: 'Acciones' },
                { key: 'saldoVencido',    label: 'Saldo vencido' }
            ],
            seccion: 'cobranza',
            niveles: ['Ideal', 'Alerta', 'Riesgo']
        },
        'Desembolso': {
            campos: [
                { key: 'dinamicaPresentacion',    label: 'Dinámica y presentación' },
                { key: 'educacionFinanciera',     label: 'Educación financiera' },
                { key: 'devolucionGarantias',     label: 'Devolución de garantías' },
                { key: 'comentariosReglamento',   label: 'Comentarios del reglamento' },
                { key: 'comentariosContrato',     label: 'Comentarios del contrato' },
                { key: 'pagoSancionesSolidarios', label: 'Pago de sanciones solidarios' }
            ],
            seccion: 'desembolsoCredito.actividadesPrevias',
            niveles: ['Totalmente', 'Parcial y/o apresurada', 'No']
        }
    };

    const def = definiciones[proceso];
    if (!def) return { campos: [], niveles: [] };

    const evsFiltradas = evaluaciones.filter(e => e.datosGenerales?.procesoEvaluado === proceso);
    const conteo = {};

    for (const campo of def.campos) {
        conteo[campo.key] = { label: campo.label };
        for (const nivel of def.niveles) conteo[campo.key][nivel] = 0;
    }

    for (const ev of evsFiltradas) {
        let seccion;
        if (def.seccion.includes('.')) {
            const parts = def.seccion.split('.');
            seccion = ev[parts[0]]?.[parts[1]] || {};
        } else {
            seccion = ev[def.seccion] || {};
        }

        for (const campo of def.campos) {
            const val = seccion[campo.key] || (campo.altKey ? seccion[campo.altKey] : undefined);
            if (val && conteo[campo.key][val] !== undefined) {
                conteo[campo.key][val]++;
            }
        }
    }

    return { campos: Object.values(conteo), niveles: def.niveles };
}

// ── Escape HTML ────────────────────────────────────────────────────────────

function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Endpoint principal ─────────────────────────────────────────────────────

const generarReporte = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, tipoAuditoria, tipoReporte, limitePorAsesor } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                message: 'Se requieren los parámetros fechaInicio y fechaFin (YYYY-MM-DD).'
            });
        }

        const inicio = new Date(`${fechaInicio}T00:00:00.000Z`);
        const fin    = new Date(`${fechaFin}T23:59:59.999Z`);

        if (isNaN(inicio) || isNaN(fin)) {
            return res.status(400).json({ success: false, message: 'Fechas inválidas.' });
        }

        // ── 1. Determinar tipo de reporte: Semanal (≤ 7 días) vs Quincenal (> 10 días) ──
        const diasPeriodo = Math.round((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
        const esQuincenal = tipoReporte === 'quincenal' || (!tipoReporte && diasPeriodo > 10);
        const esSemanal   = !esQuincenal;

        const filtro = { 'datosGenerales.fechaEvaluacion': { $gte: inicio, $lte: fin } };
        if (tipoAuditoria) filtro.tipoAuditoria = tipoAuditoria;

        const evaluaciones = await Evaluation.find(filtro)
            .select('-evidenciaFotos')
            .sort({ 'datosGenerales.fechaEvaluacion': 1 })
            .lean();

        if (evaluaciones.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontraron evaluaciones en el periodo indicado.' });
        }

        // ── IDs correspondientes a Ejecutivas ─────────────────────────────
        const IDS_EJECUTIVAS = new Set([
            '69f4bab69d6d25e533b24c19',
            '69f4bc349d6d25e533b24c84',
            '69f4bc739d6d25e533b24c87',
            '69f4bca39d6d25e533b24c8a',
            '69f4bd469d6d25e533b24c8d',
            '69f8ec4702c19412d449c94c',
            '69fd280255f770c409d0733e',
            '6a42b871aa50224e9d3c3cae',
            '6ac7c7f8b753861d82d7528c'
        ]);

        const esEjecutiva = ev => {
            const id = String(ev.datosGenerales?.asesorEvaluadoId || '').trim();
            if (IDS_EJECUTIVAS.has(id)) return true;
            const tipo = String(ev.tipoAuditoria || '').toLowerCase();
            const proc = String(ev.datosGenerales?.procesoEvaluado || '').toLowerCase();
            return tipo.includes('ejecutiva') || proc.includes('ejecutiva');
        };

        const esProcesoRecuperacion = ev => {
            const proc = String(ev.datosGenerales?.procesoEvaluado || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
            return proc === 'recuperacion';
        };

        // 1. Separar evaluaciones de Ejecutivas
        const evsEjecutivas = evaluaciones.filter(ev => esEjecutiva(ev));

        // 2. Evaluaciones de los demás (ASEC)
        const todosOtros = evaluaciones.filter(ev => !esEjecutiva(ev));

        let evsASEC = [];
        let cuotaEquitativa = 1;

        if (esQuincenal) {
            // ── REPORTE QUINCENAL ──────────────────────────────────────────
            // 1. Solo se toma en cuenta el proceso de Recuperación
            const asecRecuperacion = todosOtros.filter(esProcesoRecuperacion);

            // 2. Evaluación equitativa y justa: 1 grupo mínimo, 3 como máximo
            // Agrupar evaluaciones de cada asesor
            const evsPorAsesor = new Map();
            for (const ev of asecRecuperacion) {
                const asesor = ev.datosGenerales?.asesorEvaluadoNombre || 'Sin nombre';
                if (!evsPorAsesor.has(asesor)) {
                    evsPorAsesor.set(asesor, []);
                }
                evsPorAsesor.get(asesor).push(ev);
            }

            // Encontrar el mínimo de grupos evaluados entre los asesores
            let minEvaluaciones = Infinity;
            for (const evs of evsPorAsesor.values()) {
                if (evs.length < minEvaluaciones) {
                    minEvaluaciones = evs.length;
                }
            }

            // Adaptar cuota: si varios tienen 3+ pero uno solo tiene 1, se toma 1 grupo.
            // Si el mínimo es 2, se toman 2. Si el mínimo es 3+, se toman 3 (máximo 3).
            cuotaEquitativa = minEvaluaciones !== Infinity
                ? Math.min(3, Math.max(1, minEvaluaciones))
                : 1;

            // Tomar para cada asesor exactamente los primeros K grupos en orden cronológico
            for (const evs of evsPorAsesor.values()) {
                evs.sort((a, b) => new Date(a.datosGenerales?.fechaEvaluacion || 0) - new Date(b.datosGenerales?.fechaEvaluacion || 0));
                evsASEC.push(...evs.slice(0, cuotaEquitativa));
            }
        } else {
            // ── REPORTE SEMANAL ────────────────────────────────────────────
            // Se toman en cuenta todos los procesos evaluados y todos los grupos/individuales evaluados en el periodo
            evsASEC = todosOtros;
        }

        // ── 1. Métricas globales ──────────────────────────────────────────
        const asecSet          = new Set();
        const coordSet         = new Set();
        const gruposSet        = new Set();
        const procesosConteo   = {};
        const coordAsecConteo  = {};  // coordinacion -> set de ASECs

        for (const ev of evsASEC) {
            const dg = ev.datosGenerales || {};
            if (dg.asesorEvaluadoNombre) {
                asecSet.add(dg.asesorEvaluadoNombre);
                const coord = dg.coordinacionNombre || 'Sin coordinación';
                if (!coordAsecConteo[coord]) coordAsecConteo[coord] = new Set();
                coordAsecConteo[coord].add(dg.asesorEvaluadoNombre);
            }
            if (dg.coordinacionNombre) coordSet.add(dg.coordinacionNombre);

            const grp = dg.grupo?.nombre || dg.clienteIndividual?.nombre || '';
            if (grp) gruposSet.add(grp);

            const proc = dg.procesoEvaluado || 'Otro';
            procesosConteo[proc] = (procesosConteo[proc] || 0) + 1;
        }

        const totalAsec           = asecSet.size;
        const totalCoordinaciones = coordSet.size;
        const totalGrupos         = gruposSet.size;
        // Solo contar evaluaciones ASEC; excluir procesos de Ejecutivas
        const totalEvaluaciones   = evsASEC.length;

        // ── 2. Resultados por ASEC con detalle por grupo y listado de grupos ──
        const porAsesor = {};
        const gruposEvaluados = [];

        for (const ev of evsASEC) {
            const dg     = ev.datosGenerales || {};
            const nombre = dg.asesorEvaluadoNombre || 'Sin nombre';
            const coord  = dg.coordinacionNombre   || 'Sin coordinación';
            const pct    = calcularPorcentaje(ev);
            const grupo  = extraerNombreGrupo(dg);
            const obs    = extraerObservacion(ev);
            const proc   = dg.procesoEvaluado || '';
            const semana = dg.semanaEvaluada || '';
            const ciclo  = dg.cicloEvaluado || '';
            const fecha  = dg.fechaEvaluacion;
            const esInd  = esCreditoIndividual(ev);

            if (!porAsesor[nombre]) {
                porAsesor[nombre] = { nombre, coord, pcts: [], grupos: [] };
            }
            porAsesor[nombre].pcts.push(pct);
            porAsesor[nombre].grupos.push({ nombre: grupo, obs, proceso: proc, pct, semana, ciclo, esIndividual: esInd });

            gruposEvaluados.push({
                nombre,
                coord,
                grupo,
                proc,
                semana,
                ciclo,
                fecha,
                pct,
                promedio: pct,
                nivel: nivelTexto(pct),
                badgeClase: nivelClase(pct),
                barClase: barClase(pct),
                color: nivelColor(pct),
                cumpleMeta: pct >= META,
                obs,
                esIndividual: esInd
            });
        }

        const asecResultados = Object.values(porAsesor).map(a => {
            const promedio = Math.round(a.pcts.reduce((s, v) => s + v, 0) / a.pcts.length);
            return {
                nombre: a.nombre,
                coord: a.coord,
                totalEvaluaciones: a.pcts.length,
                promedio,
                nivel: nivelTexto(promedio),
                badgeClase: nivelClase(promedio),
                barClase: barClase(promedio),
                color: nivelColor(promedio),
                cumpleMeta: promedio >= META,
                grupos: a.grupos  // detalle por grupo
            };
        }).sort((a, b) => b.promedio - a.promedio);

        const asecCumplen     = asecResultados.filter(a => a.cumpleMeta).length;
        const asecNoCumplen   = totalAsec - asecCumplen;
        const pctCumplimiento = totalAsec > 0 ? Math.round((asecCumplen / totalAsec) * 100) : 0;

        // ── 3. Resumen de coordinaciones ──────────────────────────────────
        // "De corazón (3 ASEC), Lealtad (2 ASEC) ..."
        const coordResumenTexto = Object.entries(coordAsecConteo)
            .sort((a, b) => b[1].size - a[1].size)
            .map(([coord, set]) => `${escapeHtml(coord)} (${set.size} ASEC)`)
            .join(', ');

        // ── 4. Procesos y distribución ────────────────────────────────────
        const procesosEvaluados = Object.entries(procesosConteo).map(([proc, count]) => ({
            nombre: proc,
            grupos: count,
            evaluaciones: count,
            participacion: Math.round((count / totalEvaluaciones) * 100)
        }));

        // Texto narrativo de procesos
        const procesosTexto = procesosEvaluados
            .map(p => `${escapeHtml(p.nombre)} (${p.grupos} grupo${p.grupos !== 1 ? 's' : ''})`)
            .join(', ');

        // ── 5. Parámetros por proceso ─────────────────────────────────────
        const procesosConParametros = Object.keys(procesosConteo).map(proc => ({
            nombre: proc,
            totalEvaluaciones: procesosConteo[proc],
            ...contarParametros(evsASEC, proc)
        }));

        // ── 6. Resultados de Ejecutivas — SEPARACIÓN Operativo vs Procesos de Ejecutivas ──

        // Clasificar: ¿es evaluación de "Procesos de Ejecutivas" o es auditoría operativa en campo?
        const esProcEjecutivaEv = ev => {
            const proc = String(ev.datosGenerales?.procesoEvaluado || '').toLowerCase();
            const tipo = String(ev.tipoAuditoria || '').toLowerCase();
            // "Procesos de Ejecutivas" o tipoAuditoria === "Ejecutiva" → proceso de ejecutiva
            return proc.includes('ejecutiva') || tipo === 'ejecutiva';
        };

        // Separar
        const evsEjecOperativas = evsEjecutivas.filter(ev => !esProcEjecutivaEv(ev));
        const evsEjecProcesos   = evsEjecutivas.filter(ev => esProcEjecutivaEv(ev));

        // ── 6a. Operativas de Ejecutivas (auditorías en campo: Recuperación, etc.) ──
        const porEjecOp = {};
        for (const ev of evsEjecOperativas) {
            const dg     = ev.datosGenerales || {};
            const nombre = dg.asesorEvaluadoNombre || 'Sin nombre';
            const coord  = dg.coordinacionNombre   || 'Sin coordinación';
            const proc   = dg.procesoEvaluado      || '';
            const grupo  = extraerNombreGrupo(dg);
            const obs    = extraerObservacion(ev);
            const pct    = calcularPorcentaje(ev);
            const semana = dg.semanaEvaluada        || '';
            const ciclo  = dg.cicloEvaluado         || '';
            const esInd  = esCreditoIndividual(ev);

            if (!porEjecOp[nombre]) {
                porEjecOp[nombre] = { nombre, coord, pcts: [], grupos: [] };
            }
            porEjecOp[nombre].pcts.push(pct);
            porEjecOp[nombre].grupos.push({ nombre: grupo, obs, proceso: proc, pct, semana, ciclo, esIndividual: esInd });
        }

        const ejecOpResultados = Object.values(porEjecOp).map(a => {
            const promedio = Math.round(a.pcts.reduce((s, v) => s + v, 0) / a.pcts.length);
            return {
                nombre: a.nombre, coord: a.coord,
                totalEvaluaciones: a.pcts.length, promedio,
                nivel: nivelTexto(promedio), badgeClase: nivelClase(promedio),
                barClase: barClase(promedio), color: nivelColor(promedio),
                cumpleMeta: promedio >= META, grupos: a.grupos
            };
        }).sort((a, b) => b.promedio - a.promedio);

        const totalEjecOp     = ejecOpResultados.length;
        const evalsEjecOp     = evsEjecOperativas.length;
        const promEjecOp      = totalEjecOp > 0 ? Math.round(ejecOpResultados.reduce((s, e) => s + e.promedio, 0) / totalEjecOp) : 0;
        const ejecOpCumplen   = ejecOpResultados.filter(e => e.cumpleMeta).length;

        // ── 6b. Procesos de Ejecutivas (actividades administrativas y de sucursal) ──
        // Etiquetas legibles para las claves de calificacionesDetalle
        const LABELS_DETALLE_EJEC = {
            rec_cuadrar:        'Cuadrar recuperación',
            rec_zona_roja:      'Zona roja',
            rec_impresion:      'Impresión de reportes',
            col_envio:          'Envío de colocación',
            col_expediente:     'Expediente completo',
            col_tesoreria:      'Tesorería',
            col_credito_magico: 'Crédito mágico',
            conc_envio:         'Envío de conciliación',
            reu_seguimiento:    'Seguimiento de reuniones',
            proy_escanea:       'Escaneo de proyectos',
            gar_solicitud:      'Solicitud de garantías',
            cal_recibe:         'Recibe calidad',
            req_insumos:        'Requerimiento de insumos',
            req_ahorros:        'Requerimiento de ahorros'
        };

        // Categorías para agrupar las actividades
        const CATEGORIAS_EJEC = {
            'Recuperación':     ['rec_cuadrar', 'rec_zona_roja', 'rec_impresion'],
            'Colocación':       ['col_envio', 'col_expediente', 'col_tesoreria', 'col_credito_magico'],
            'Conciliación':     ['conc_envio'],
            'Reuniones':        ['reu_seguimiento'],
            'Proyectos':        ['proy_escanea'],
            'Garantías':        ['gar_solicitud'],
            'Calidad':          ['cal_recibe'],
            'Requerimientos':   ['req_insumos', 'req_ahorros']
        };

        const porEjecProc = {};
        for (const ev of evsEjecProcesos) {
            const dg     = ev.datosGenerales || {};
            const nombre = dg.asesorEvaluadoNombre || 'Sin nombre';
            const coord  = dg.coordinacionNombre   || 'Sin coordinación';
            const grupo  = extraerNombreGrupo(dg);
            const obs    = extraerObservacion(ev);
            const pct    = calcularPorcentaje(ev);
            const semana = dg.semanaEvaluada        || '';
            const ciclo  = dg.cicloEvaluado         || '';

            if (!porEjecProc[nombre]) {
                porEjecProc[nombre] = { nombre, coord, pcts: [], grupos: [], detalles: [] };
            }
            porEjecProc[nombre].pcts.push(pct);
            porEjecProc[nombre].grupos.push({ nombre: grupo, obs, pct, semana, ciclo });
            if (ev.calificacionesDetalle && Object.keys(ev.calificacionesDetalle).length > 0) {
                porEjecProc[nombre].detalles.push(ev.calificacionesDetalle);
            }
        }

        const ejecProcResultados = Object.values(porEjecProc).map(a => {
            const promedio = Math.round(a.pcts.reduce((s, v) => s + v, 0) / a.pcts.length);
            return {
                nombre: a.nombre, coord: a.coord,
                totalEvaluaciones: a.pcts.length, promedio,
                nivel: nivelTexto(promedio), badgeClase: nivelClase(promedio),
                barClase: barClase(promedio), color: nivelColor(promedio),
                cumpleMeta: promedio >= META, grupos: a.grupos, detalles: a.detalles
            };
        }).sort((a, b) => b.promedio - a.promedio);

        const totalEjecProc     = ejecProcResultados.length;
        const evalsEjecProc     = evsEjecProcesos.length;
        const promEjecProc      = totalEjecProc > 0 ? Math.round(ejecProcResultados.reduce((s, e) => s + e.promedio, 0) / totalEjecProc) : 0;
        const ejecProcCumplen   = ejecProcResultados.filter(e => e.cumpleMeta).length;

        // Conteo global de actividades por categoría (para desglose)
        const conteoActividades = {};
        for (const ev of evsEjecProcesos) {
            const det = ev.calificacionesDetalle || {};
            for (const [key, val] of Object.entries(det)) {
                if (!conteoActividades[key]) conteoActividades[key] = { ideal: 0, alerta: 0, riesgo: 0 };
                const v = String(val).toLowerCase();
                if (v.includes('ideal') || v.includes('totalmente')) conteoActividades[key].ideal++;
                else if (v.includes('alerta') || v.includes('parcial')) conteoActividades[key].alerta++;
                else if (v.includes('riesgo') || v === 'no') conteoActividades[key].riesgo++;
            }
        }

        // Métricas globales combinadas para referencia
        const totalEjecutivas = new Set([...Object.keys(porEjecOp), ...Object.keys(porEjecProc)]).size;
        const evaluacionesEjecutivas = evsEjecutivas.length;
        const ejecutivasCumplen = totalEjecutivas; // se recalcula abajo
        const promedioGeneralEjecutivas = evaluacionesEjecutivas > 0 ? Math.round(
            evsEjecutivas.reduce((s, ev) => s + calcularPorcentaje(ev), 0) / evaluacionesEjecutivas
        ) : 0;

        // ── 7. Auto-conclusiones ──────────────────────────────────────────
        const asecRiesgo = asecResultados.filter(a => a.promedio < 60);
        const asecAlerta = asecResultados.filter(a => a.promedio >= 60 && a.promedio < 80);

        const parametrosEnRiesgo = [];
        for (const proc of procesosConParametros) {
            if (!proc.campos) continue;
            const nivelR = proc.niveles?.find(n => n.toLowerCase().includes('riesgo') || n === 'No');
            if (!nivelR) continue;
            for (const campo of proc.campos) {
                if ((campo[nivelR] || 0) >= 2) {
                    parametrosEnRiesgo.push(`${campo.label} (${proc.nombre})`);
                }
            }
        }

        // ── 8. HTML de cada sección ───────────────────────────────────────
        const fechaGeneracion = formatDateShort(new Date());
        const periodoLargo    = `${formatDateES(inicio)} al ${formatDateES(fin)}`;
        const periodoCorto    = `${formatDateShort(inicio)} - ${formatDateShort(fin)}`;
        const tipoLabel       = tipoAuditoria || 'Auditoría Operativa';

        // SVG dona
        const svgDona = generarDonaFull(pctCumplimiento);

        // Tabla resumen ASEC (página 1) - incluye los grupos evaluados y sus notas
        const filasAsec = asecResultados.map(a => `
            <tr>
                <td>
                    <div style="font-weight:700;font-size:11px;">${escapeHtml(a.nombre.toUpperCase())}</div>
                    <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                        ${a.grupos.map(g => `
                            <span style="font-size:8px;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;padding:1px 5px;display:inline-flex;align-items:center;gap:4px;">
                                <span style="font-weight:600;color:var(--navy);">${escapeHtml(g.nombre || 'G. S/N')}</span>
                                <span style="color:${nivelColor(g.pct)};font-weight:800;">${g.pct}%</span>
                            </span>
                        `).join('')}
                    </div>
                </td>
                <td>${escapeHtml(a.coord.toUpperCase())}</td>
                <td class="text-center">${a.totalEvaluaciones}</td>
                <td class="text-center" style="font-weight:800;color:${a.color};font-size:12px;">${a.promedio}%</td>
                <td class="text-center"><span class="badge ${a.badgeClase}">${a.nivel}</span></td>
                <td class="text-center">
                    <span class="badge ${a.cumpleMeta ? 'badge-success' : 'badge-danger'}">
                        ${a.cumpleMeta ? 'SI' : 'NO'}
                    </span>
                </td>
            </tr>`).join('');

        // Tabla detallada de todos los Grupos Auditados (página 2)
        gruposEvaluados.sort((a, b) => b.pct - a.pct);

        const filasGrupos = gruposEvaluados.map((g, idx) => `
            <tr>
                <td class="text-center" style="color:var(--muted);font-weight:600;font-size:9px;">${idx + 1}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <strong>${escapeHtml(g.grupo.toUpperCase())}</strong>
                        <span class="badge ${g.esIndividual ? 'badge-warning' : 'badge-info'}" style="font-size:7.5px;padding:1px 5px;">
                            ${g.esIndividual ? 'INDIVIDUAL' : 'GRUPAL'}
                        </span>
                    </div>
                </td>
                <td>${escapeHtml(g.nombre.toUpperCase())}</td>
                <td>${escapeHtml(g.coord.toUpperCase())}</td>
                <td><span class="badge badge-info">${escapeHtml(g.proc || 'N/A')}</span></td>
                <td class="text-center" style="font-size:9px;color:var(--slate);">${escapeHtml(g.semana ? `S${g.semana}` : '-')}${g.ciclo ? ` / C${g.ciclo}` : ''}</td>
                <td class="text-center">
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                        <div style="width:34px;height:5px;background:var(--border);border-radius:10px;overflow:hidden;">
                            <div style="width:${g.pct}%;height:100%;background:${g.color};border-radius:10px;"></div>
                        </div>
                        <span style="font-weight:800;color:${g.color};font-size:11px;">${g.pct}%</span>
                    </div>
                </td>
                <td class="text-center"><span class="badge ${g.badgeClase}">${g.nivel}</span></td>
                <td class="text-center">
                    <span class="badge ${g.cumpleMeta ? 'badge-success' : 'badge-danger'}">
                        ${g.cumpleMeta ? 'SI' : 'NO'}
                    </span>
                </td>
            </tr>`).join('');

        // Barras de desempeño ASEC
        const barrasDesempeno = asecResultados.map(a => `
            <div class="perf-row">
                <div class="perf-name">${escapeHtml(a.nombre)}</div>
                <div class="perf-track">
                    <div class="perf-bar ${a.barClase}" style="width:${a.promedio}%;"></div>
                </div>
                <div class="perf-val" style="color:${a.color};">${a.promedio}%</div>
            </div>`).join('');

        // Tarjetas de proceso
        const coloresProc = ['#1d4ed8', '#7c3aed', '#0891b2', '#059669', '#b45309'];
        const tarjetasProcesos = procesosEvaluados.map((p, i) => `
            <div class="proc-card" style="border-left-color:${coloresProc[i % coloresProc.length]};">
                <div class="proc-name">${escapeHtml(p.nombre)}</div>
                <div class="proc-num" style="color:${coloresProc[i % coloresProc.length]};">${p.grupos}</div>
                <div class="proc-sub">grupo${p.grupos !== 1 ? 's' : ''} evaluado${p.grupos !== 1 ? 's' : ''}</div>
            </div>`).join('');

        // Filas distribución
        const filasProcesos = procesosEvaluados.map(p => `
            <tr>
                <td><strong>${escapeHtml(p.nombre)}</strong></td>
                <td class="text-center">${p.grupos}</td>
                <td class="text-center">${p.evaluaciones}</td>
                <td class="text-center">${p.participacion}%</td>
            </tr>`).join('');

        // Bloques de parámetros con celdas coloreadas
        const bloquesParametros = procesosConParametros.map(proc => {
            if (!proc.campos || proc.campos.length === 0) return '';
            const encabezados = proc.niveles.map((n, i) => {
                const colors = ['#16a34a', '#b45309', '#dc2626'];
                return `<th class="text-center" style="background:${colors[i] || '#334155'};">${escapeHtml(n)}</th>`;
            }).join('');
            const filas = proc.campos.map(campo => {
                const v0 = campo[proc.niveles[0]] ?? 0;
                const v1 = campo[proc.niveles[1]] ?? 0;
                const v2 = campo[proc.niveles[2]] ?? 0;
                return `<tr>
                    <td>${escapeHtml(campo.label)}</td>
                    <td class="text-center cell-ideal">${v0}</td>
                    <td class="text-center cell-alerta">${v1}</td>
                    <td class="text-center cell-riesgo">${v2}</td>
                </tr>`;
            }).join('');
            return `
            <div class="param-block">
                <div class="param-header">
                    <h3>${escapeHtml(proc.nombre)}</h3>
                    <span>${proc.totalEvaluaciones} evaluaciones</span>
                </div>
                <table>
                    <thead><tr><th>Parámetro</th>${encabezados}</tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>`;
        }).join('');

        // ── BLOQUES DE INCIDENCIAS con detalle por grupo ──────────────────
        const bloquesIncidencias = asecResultados.map(a => {
            const badgeMeta = a.cumpleMeta
                ? `<span class="badge badge-success">Meta: SI</span>`
                : `<span class="badge badge-danger">Meta: NO</span>`;

            // Grupos con observaciones
            const gruposConObs = a.grupos.filter(g => g.obs && g.obs.trim());
            const gruposSinObs = a.grupos.filter(g => !g.obs || !g.obs.trim());

            let contenido = '';

            if (gruposConObs.length > 0) {
                contenido += gruposConObs.map(g => `
                    <div class="grupo-inc-item">
                        <div class="grupo-inc-nombre">
                            <span class="grupo-tag" ${g.esIndividual ? 'style="background:#d97706;"' : ''}>${g.esIndividual ? 'IND' : 'G.'}</span> ${escapeHtml(g.nombre || 'Sin nombre')}
                            ${g.proceso ? `<span class="proceso-tag">${escapeHtml(g.proceso)}</span>` : ''}
                            <span class="badge ${nivelClase(g.pct)}" style="margin-left:auto;font-size:8.5px;font-weight:700;">Calificación: ${g.pct}% · ${nivelTexto(g.pct)}</span>
                        </div>
                        <div class="grupo-inc-obs">${escapeHtml(g.obs)}</div>
                    </div>`).join('');
            }

            if (gruposSinObs.length > 0) {
                contenido += gruposSinObs.map(g => `
                    <div class="grupo-inc-item" style="border-left-color: #16a34a;">
                        <div class="grupo-inc-nombre">
                            <span class="grupo-tag" style="background:${g.esIndividual ? '#d97706' : '#16a34a'};">${g.esIndividual ? 'IND' : 'G.'}</span> ${escapeHtml(g.nombre || 'Sin nombre')}
                            ${g.proceso ? `<span class="proceso-tag">${escapeHtml(g.proceso)}</span>` : ''}
                            <span class="badge ${nivelClase(g.pct)}" style="margin-left:auto;font-size:8.5px;font-weight:700;">Calificación: ${g.pct}% · ${nivelTexto(g.pct)}</span>
                        </div>
                        <div class="grupo-inc-obs" style="color:var(--muted);font-style:italic;">Sin incidencias reportadas. Cumplimiento dentro de los estándares.</div>
                    </div>`).join('');
            }

            if (!contenido) {
                contenido = `<div class="no-incidents">No se identificaron incidencias relevantes durante el periodo evaluado.</div>`;
            }

            return `
            <div class="advisor-block">
                <div class="advisor-header">
                    <div>
                        <div class="advisor-name">${escapeHtml(a.nombre.toUpperCase())}</div>
                        <div class="advisor-coord">
                            <strong>COORD</strong> ${escapeHtml(a.coord || 'N/A')} &nbsp;·&nbsp;
                            ${a.totalEvaluaciones} evaluación${a.totalEvaluaciones !== 1 ? 'es' : ''}
                        </div>
                    </div>
                    <div class="advisor-score-wrap">
                        <div class="advisor-score" style="color:${a.color};">${a.promedio}%</div>
                        ${badgeMeta}
                    </div>
                </div>
                <div class="grupos-inc-list">${contenido}</div>
            </div>`;
        }).join('');

        // ══════════════════════════════════════════════════════════════════
        // HTML SECCIÓN A: OPERATIVAS DE EJECUTIVAS (auditorías en campo)
        // ══════════════════════════════════════════════════════════════════

        // Barras de desempeño operativo de ejecutivas
        const barrasEjecOperativas = ejecOpResultados.map(a => `
            <div class="perf-row">
                <div class="perf-name">${escapeHtml(a.nombre)}</div>
                <div class="perf-track">
                    <div class="perf-bar ${a.barClase}" style="width:${a.promedio}%;"></div>
                </div>
                <div class="perf-val" style="color:${a.color};">${a.promedio}%</div>
            </div>`).join('') || '<div class="no-incidents">Sin datos de auditorías operativas para ejecutivas.</div>';

        // Filas tabla operativa de ejecutivas (detalle de grupos/individuales)
        const gruposEjecOp = [];
        for (const a of ejecOpResultados) {
            for (const g of a.grupos) {
                gruposEjecOp.push({ ...g, asesor: a.nombre, coord: a.coord, color: nivelColor(g.pct) });
            }
        }
        gruposEjecOp.sort((a, b) => b.pct - a.pct);

        const filasEjecOperativas = gruposEjecOp.map((g, idx) => `
            <tr>
                <td class="text-center" style="color:var(--muted);font-weight:600;font-size:9px;">${idx + 1}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <strong>${escapeHtml((g.nombre || 'S/N').toUpperCase())}</strong>
                        <span class="badge ${g.esIndividual ? 'badge-warning' : 'badge-info'}" style="font-size:7.5px;padding:1px 5px;">
                            ${g.esIndividual ? 'INDIVIDUAL' : 'GRUPAL'}
                        </span>
                    </div>
                </td>
                <td>${escapeHtml(g.asesor.toUpperCase())}</td>
                <td>${escapeHtml(g.coord.toUpperCase())}</td>
                <td><span class="badge badge-info">${escapeHtml(g.proceso || 'N/A')}</span></td>
                <td class="text-center" style="font-size:9px;color:var(--slate);">${escapeHtml(g.semana ? `S${g.semana}` : '-')}${g.ciclo ? ` / C${g.ciclo}` : ''}</td>
                <td class="text-center">
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                        <div style="width:34px;height:5px;background:var(--border);border-radius:10px;overflow:hidden;">
                            <div style="width:${g.pct}%;height:100%;background:${g.color};border-radius:10px;"></div>
                        </div>
                        <span style="font-weight:800;color:${g.color};font-size:11px;">${g.pct}%</span>
                    </div>
                </td>
                <td class="text-center"><span class="badge ${nivelClase(g.pct)}">${nivelTexto(g.pct)}</span></td>
                <td class="text-center">
                    <span class="badge ${g.pct >= META ? 'badge-success' : 'badge-danger'}">
                        ${g.pct >= META ? 'SI' : 'NO'}
                    </span>
                </td>
            </tr>`).join('') || `<tr><td colspan="9" class="text-center" style="color:var(--muted);padding:12px;">Sin auditorías operativas de ejecutivas.</td></tr>`;

        // Bloques de incidencias operativas de ejecutivas
        const bloquesIncidenciasEjecOp = ejecOpResultados.map(a => {
            const badgeMeta = a.cumpleMeta
                ? `<span class="badge badge-success">Meta: SI</span>`
                : `<span class="badge badge-danger">Meta: NO</span>`;

            const gruposConObs = a.grupos.filter(g => g.obs && g.obs.trim());
            const gruposSinObs = a.grupos.filter(g => !g.obs || !g.obs.trim());
            let contenido = '';

            if (gruposConObs.length > 0) {
                contenido += gruposConObs.map(g => `
                    <div class="grupo-inc-item">
                        <div class="grupo-inc-nombre">
                            <span class="grupo-tag" ${g.esIndividual ? 'style="background:#d97706;"' : ''}>${g.esIndividual ? 'IND' : 'G.'}</span> ${escapeHtml(g.nombre || 'Sin nombre')}
                            ${g.proceso ? `<span class="proceso-tag">${escapeHtml(g.proceso)}</span>` : ''}
                            <span class="badge ${nivelClase(g.pct)}" style="margin-left:auto;font-size:8.5px;font-weight:700;">${g.pct}% · ${nivelTexto(g.pct)}</span>
                        </div>
                        <div class="grupo-inc-obs">${escapeHtml(g.obs)}</div>
                    </div>`).join('');
            }
            if (gruposSinObs.length > 0) {
                contenido += gruposSinObs.map(g => `
                    <div class="grupo-inc-item" style="border-left-color:#16a34a;">
                        <div class="grupo-inc-nombre">
                            <span class="grupo-tag" style="background:${g.esIndividual ? '#d97706' : '#16a34a'};">${g.esIndividual ? 'IND' : 'G.'}</span> ${escapeHtml(g.nombre || 'Sin nombre')}
                            ${g.proceso ? `<span class="proceso-tag">${escapeHtml(g.proceso)}</span>` : ''}
                            <span class="badge ${nivelClase(g.pct)}" style="margin-left:auto;font-size:8.5px;font-weight:700;">${g.pct}% · ${nivelTexto(g.pct)}</span>
                        </div>
                        <div class="grupo-inc-obs" style="color:var(--muted);font-style:italic;">Sin incidencias reportadas.</div>
                    </div>`).join('');
            }
            if (!contenido) contenido = '<div class="no-incidents">Sin incidencias registradas.</div>';

            return `
            <div class="advisor-block" style="border-left: 3px solid #0891b2;">
                <div class="advisor-header">
                    <div>
                        <div class="advisor-name" style="color:#0891b2;">${escapeHtml(a.nombre.toUpperCase())}</div>
                        <div class="advisor-coord">
                            <strong>COORD</strong> ${escapeHtml(a.coord || 'N/A')} &nbsp;·&nbsp;
                            ${a.totalEvaluaciones} evaluación${a.totalEvaluaciones !== 1 ? 'es' : ''} en campo
                        </div>
                    </div>
                    <div class="advisor-score-wrap">
                        <div class="advisor-score" style="color:${a.color};">${a.promedio}%</div>
                        ${badgeMeta}
                    </div>
                </div>
                <div class="grupos-inc-list">${contenido}</div>
            </div>`;
        }).join('') || '<div class="no-incidents">Sin incidencias operativas de ejecutivas.</div>';

        // ══════════════════════════════════════════════════════════════════
        // HTML SECCIÓN B: PROCESOS DE EJECUTIVAS (actividades administrativas)
        // ══════════════════════════════════════════════════════════════════

        // Barras de desempeño procesos de ejecutivas
        const barrasEjecProcesos = ejecProcResultados.map(a => `
            <div class="perf-row">
                <div class="perf-name">${escapeHtml(a.nombre)}</div>
                <div class="perf-track">
                    <div class="perf-bar ${a.barClase}" style="width:${a.promedio}%;"></div>
                </div>
                <div class="perf-val" style="color:${a.color};">${a.promedio}%</div>
            </div>`).join('') || '<div class="no-incidents">Sin datos de procesos de ejecutivas.</div>';

        // Filas tabla procesos de ejecutivas
        const gruposEjecProc = [];
        for (const a of ejecProcResultados) {
            for (const g of a.grupos) {
                gruposEjecProc.push({ ...g, asesor: a.nombre, coord: a.coord, color: nivelColor(g.pct) });
            }
        }
        gruposEjecProc.sort((a, b) => b.pct - a.pct);

        const filasEjecProcesos = gruposEjecProc.map((g, idx) => `
            <tr>
                <td class="text-center" style="color:var(--muted);font-weight:600;font-size:9px;">${idx + 1}</td>
                <td><strong>${escapeHtml(g.asesor.toUpperCase())}</strong></td>
                <td>${escapeHtml(g.coord.toUpperCase())}</td>
                <td class="text-center" style="font-size:9px;color:var(--slate);">${escapeHtml(g.semana ? `S${g.semana}` : '-')}${g.ciclo ? ` / C${g.ciclo}` : ''}</td>
                <td class="text-center">
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                        <div style="width:34px;height:5px;background:var(--border);border-radius:10px;overflow:hidden;">
                            <div style="width:${g.pct}%;height:100%;background:${g.color};border-radius:10px;"></div>
                        </div>
                        <span style="font-weight:800;color:${g.color};font-size:11px;">${g.pct}%</span>
                    </div>
                </td>
                <td class="text-center"><span class="badge ${nivelClase(g.pct)}">${nivelTexto(g.pct)}</span></td>
                <td class="text-center">
                    <span class="badge ${g.pct >= META ? 'badge-success' : 'badge-danger'}">
                        ${g.pct >= META ? 'SI' : 'NO'}
                    </span>
                </td>
            </tr>`).join('') || `<tr><td colspan="7" class="text-center" style="color:var(--muted);padding:12px;">Sin evaluaciones de procesos de ejecutivas.</td></tr>`;

        // Bloques de desglose de actividades por categoría e incidencias
        let bloquesDetalleEjecProcesos = '';

        // Tabla de desglose por actividad (conteo global)
        if (Object.keys(conteoActividades).length > 0) {
            let tablaActividades = '';
            for (const [categoria, keys] of Object.entries(CATEGORIAS_EJEC)) {
                const keysPresentes = keys.filter(k => conteoActividades[k]);
                if (keysPresentes.length === 0) continue;

                tablaActividades += `
                <div class="param-block" style="margin-bottom:12px;">
                    <div class="param-header">
                        <h3>${escapeHtml(categoria)}</h3>
                        <span>${keysPresentes.length} actividad${keysPresentes.length !== 1 ? 'es' : ''}</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Actividad</th>
                                <th class="text-center" style="background:#16a34a;">Ideal</th>
                                <th class="text-center" style="background:#b45309;">Alerta</th>
                                <th class="text-center" style="background:#dc2626;">Riesgo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${keysPresentes.map(k => {
                                const c = conteoActividades[k];
                                return `<tr>
                                    <td>${escapeHtml(LABELS_DETALLE_EJEC[k] || k)}</td>
                                    <td class="text-center cell-ideal">${c.ideal}</td>
                                    <td class="text-center cell-alerta">${c.alerta}</td>
                                    <td class="text-center cell-riesgo">${c.riesgo}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Actividades sin categoría conocida
            const keysConocidas = new Set(Object.values(CATEGORIAS_EJEC).flat());
            const keysDesconocidas = Object.keys(conteoActividades).filter(k => !keysConocidas.has(k));
            if (keysDesconocidas.length > 0) {
                tablaActividades += `
                <div class="param-block" style="margin-bottom:12px;">
                    <div class="param-header">
                        <h3>Otras actividades</h3>
                        <span>${keysDesconocidas.length} actividad${keysDesconocidas.length !== 1 ? 'es' : ''}</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Actividad</th>
                                <th class="text-center" style="background:#16a34a;">Ideal</th>
                                <th class="text-center" style="background:#b45309;">Alerta</th>
                                <th class="text-center" style="background:#dc2626;">Riesgo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${keysDesconocidas.map(k => {
                                const c = conteoActividades[k];
                                return `<tr>
                                    <td>${escapeHtml(LABELS_DETALLE_EJEC[k] || k)}</td>
                                    <td class="text-center cell-ideal">${c.ideal}</td>
                                    <td class="text-center cell-alerta">${c.alerta}</td>
                                    <td class="text-center cell-riesgo">${c.riesgo}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            bloquesDetalleEjecProcesos += tablaActividades;
        }

        // Incidencias por ejecutiva en procesos
        bloquesDetalleEjecProcesos += ejecProcResultados.map(ej => {
            const gruposConObs = ej.grupos.filter(g => g.obs && g.obs.trim());
            if (gruposConObs.length === 0) return '';

            return `
            <div class="advisor-block" style="border-left: 3px solid #7c3aed; margin-top:10px;">
                <div class="advisor-header">
                    <div>
                        <div class="advisor-name" style="color:#7c3aed;">${escapeHtml(ej.nombre.toUpperCase())}</div>
                        <div class="advisor-coord">
                            <strong>COORD</strong> ${escapeHtml(ej.coord || 'N/A')} &nbsp;·&nbsp;
                            ${ej.totalEvaluaciones} evaluación${ej.totalEvaluaciones !== 1 ? 'es' : ''}
                        </div>
                    </div>
                    <div class="advisor-score-wrap">
                        <div class="advisor-score" style="color:${ej.color};">${ej.promedio}%</div>
                        <span class="badge ${ej.cumpleMeta ? 'badge-success' : 'badge-danger'}">
                            ${ej.cumpleMeta ? 'CUMPLE' : 'NO CUMPLE'}
                        </span>
                    </div>
                </div>
                <div class="grupos-inc-list">
                    ${gruposConObs.map(g => `
                        <div class="grupo-inc-item" style="border-left-color:#7c3aed;">
                            <div class="grupo-inc-nombre">
                                <span class="grupo-tag" style="background:#7c3aed;">EJEC</span> Procesos de Ejecutivas
                                ${g.semana ? `<span class="proceso-tag">Sem ${escapeHtml(g.semana)}</span>` : ''}
                                <span style="font-weight:800;color:${nivelColor(g.pct)};font-size:10px;margin-left:auto;">${g.pct}%</span>
                            </div>
                            <div class="grupo-inc-obs">${escapeHtml(g.obs)}</div>
                        </div>`).join('')}
                </div>
            </div>`;
        }).join('');

        if (!bloquesDetalleEjecProcesos.trim()) {
            bloquesDetalleEjecProcesos = '<div class="no-incidents">Sin detalles ni incidencias de procesos de ejecutivas en el periodo.</div>';
        }

        // ── Hallazgos para conclusiones ───────────────────────────────────
        let textoHallazgos = '';
        if (parametrosEnRiesgo.length > 0) {
            textoHallazgos += parametrosEnRiesgo.slice(0, 5)
                .map(p => `<li>${escapeHtml(p)} presentó frecuencia de riesgo durante el periodo.</li>`).join('');
        } else {
            textoHallazgos += '<li>No se identificaron parámetros con alta frecuencia de riesgo.</li>';
        }
        asecAlerta.forEach(a => {
            textoHallazgos += `<li>${escapeHtml(a.nombre)} se encuentra en nivel de alerta con ${a.promedio}% de cumplimiento.</li>`;
        });
        asecRiesgo.forEach(a => {
            textoHallazgos += `<li>${escapeHtml(a.nombre)} presenta nivel de riesgo con ${a.promedio}%, requiriendo atención prioritaria.</li>`;
        });

        const resumenPeriodoTexto = esQuincenal
            ? `Este reporte quincenal contempla únicamente el proceso de <strong>Recuperación</strong> evaluado bajo un criterio equitativo y justo (${cuotaEquitativa} grupo${cuotaEquitativa !== 1 ? 's' : ''} por asesor evaluado), garantizando igualdad de condiciones en la muestra analizada.`
            : `Este reporte semanal integra <strong>todos los procesos operativos evaluados</strong> (${procesosTexto || 'Recuperación, Renovación, Desembolso, Cobranza'}), reflejando el 100% de los grupos y créditos individuales auditados en el periodo sin tope de muestra.`;

        // ── Leer template y reemplazar placeholders ───────────────────────
        const templatePath = path.join(__dirname, '../templates/reporte_acc_template.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        const reemplazos = {
            PERIODO_LARGO:               periodoLargo,
            PERIODO_CORTO:               periodoCorto,
            FECHA_GENERACION:            fechaGeneracion,
            TIPO_AUDITORIA:              tipoLabel,
            RESUMEN_PERIODO_TEXTO:       resumenPeriodoTexto,
            TOTAL_ASEC:                  totalAsec,
            TOTAL_COORDINACIONES:        totalCoordinaciones,
            TOTAL_GRUPOS:                totalGrupos,
            TOTAL_EVALUACIONES:          totalEvaluaciones,
            ASEC_CUMPLEN:                asecCumplen,
            ASEC_TOTAL:                  totalAsec,
            PCT_CUMPLIMIENTO:            pctCumplimiento,
            META:                        META,
            SVG_DONA:                    svgDona,
            COORD_RESUMEN:               coordResumenTexto,
            PROCESOS_TEXTO:              procesosTexto,
            COP_COUNT:                   0,
            FILAS_ASEC:                  filasAsec,
            FILAS_GRUPOS:                filasGrupos,
            BARRAS_DESEMPENO:            barrasDesempeno,
            TARJETAS_PROCESOS:           tarjetasProcesos,
            FILAS_PROCESOS:              filasProcesos,
            BLOQUES_PARAMETROS:          bloquesParametros,
            BLOQUES_INCIDENCIAS:         bloquesIncidencias,
            BLOQUES_COP:                 '',
            // ── Sección Operativas de Ejecutivas ──
            TOTAL_EJEC_OPERATIVAS:       totalEjecOp,
            EVALS_EJEC_OPERATIVAS:       evalsEjecOp,
            PROMEDIO_EJEC_OPERATIVAS:    promEjecOp,
            EJEC_OPERATIVAS_CUMPLEN:     ejecOpCumplen,
            BARRAS_EJEC_OPERATIVAS:      barrasEjecOperativas,
            FILAS_EJEC_OPERATIVAS:       filasEjecOperativas,
            BLOQUES_INCIDENCIAS_EJEC_OP: bloquesIncidenciasEjecOp,
            // ── Sección Procesos de Ejecutivas ──
            TOTAL_EJEC_PROCESOS:         totalEjecProc,
            EVALS_EJEC_PROCESOS:         evalsEjecProc,
            PROMEDIO_EJEC_PROCESOS:      promEjecProc,
            EJEC_PROCESOS_CUMPLEN:       ejecProcCumplen,
            BARRAS_EJEC_PROCESOS:        barrasEjecProcesos,
            FILAS_EJEC_PROCESOS:         filasEjecProcesos,
            BLOQUES_DETALLE_EJEC_PROCESOS: bloquesDetalleEjecProcesos,
            // ── Conclusiones ──
            TEXTO_HALLAZGOS:             textoHallazgos,
            FILAS_RESUMEN_FINAL:         '',
            CONCL_TOTAL_EVALUACIONES: totalEvaluaciones,
            CONCL_TOTAL_GRUPOS:       totalGrupos,
            CONCL_TOTAL_ASEC:         totalAsec,
            CONCL_ASEC_CUMPLEN:       asecCumplen,
            CONCL_ASEC_NO_CUMPLEN:    asecNoCumplen
        };

        for (const [key, value] of Object.entries(reemplazos)) {
            html = html.replaceAll(`{{${key}}}`, value);
        }

        // Manejar bloques condicionales de Ejecutivas (2 secciones separadas)
        if (totalEjecOp > 0) {
            html = html.replace(/\{\{#if_ejecutivas_operativas\}\}/g, '').replace(/\{\{\/if_ejecutivas_operativas\}\}/g, '');
        } else {
            html = html.replace(/\{\{#if_ejecutivas_operativas\}\}[\s\S]*?\{\{\/if_ejecutivas_operativas\}\}/g, '');
        }

        if (totalEjecProc > 0) {
            html = html.replace(/\{\{#if_ejecutivas_procesos\}\}/g, '').replace(/\{\{\/if_ejecutivas_procesos\}\}/g, '');
        } else {
            html = html.replace(/\{\{#if_ejecutivas_procesos\}\}[\s\S]*?\{\{\/if_ejecutivas_procesos\}\}/g, '');
        }

        // Limpiar bloques condicionales obsoletos
        html = html.replace(/\{\{#if_ejecutivas\}\}[\s\S]*?\{\{\/if_ejecutivas\}\}/g, '');
        html = html.replace(/\{\{#if_cop\}\}[\s\S]*?\{\{\/if_cop\}\}/g, '');

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="reporte_${fechaInicio}_${fechaFin}.html"`);
        res.send(html);

    } catch (error) {
        console.error('Error al generar reporte:', error);
        res.status(500).json({ success: false, message: 'Error al generar el reporte', error: error.message });
    }
};

module.exports = { generarReporte };
