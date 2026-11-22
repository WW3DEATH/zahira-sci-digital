import { evaluate } from 'mathjs';

/**
 * Client-side Science EM study knowledge & Math.js fallback engine.
 * Used when the Express `/api/gemini/*` backend is unavailable (e.g. static `dist/` hosting).
 */
export function generateClientTutorFallback(
  question: string,
  subject: string,
  topic: string,
  style: string
): string {
  const raw = (question || '').trim();
  const q = raw.toLowerCase();

  // Check if the user entered a direct arithmetic/algebraic expression to evaluate
  const strippedExpr = raw
    .replace(/^(calculate|compute|evaluate|solve|what is)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();
  if (/^[0-9+\-*/^().\s]+$/.test(strippedExpr) && /[+\-*/^]/.test(strippedExpr)) {
    try {
      const val = evaluate(strippedExpr);
      if (typeof val === 'number' || typeof val === 'bigint') {
        return `### Exact Calculation Result\n\n- **Expression:** \`${strippedExpr}\`\n- **Evaluated Answer:**\n$$${strippedExpr} = ${val}$$\n\n*(Verified using the built-in Math.js engine.)*`;
      }
    } catch {
      // Fall through to subject response
    }
  }

  // Combined Mathematics
  if (
    q.includes('derivative') ||
    q.includes('differentiat') ||
    q.includes('calculus') ||
    q.includes('dy/dx') ||
    q.includes('tangent')
  ) {
    return `### Combined Mathematics: Differentiation & Calculus

**Core Principle:**
The derivative $\\frac{dy}{dx}$ represents the instantaneous rate of change of a function with respect to $x$.

**Fundamental Differentiation Rules:**
- **Power Rule:** $\\frac{d}{dx}[x^n] = n x^{n-1}$
- **Product Rule:** $\\frac{d}{dx}[u \\cdot v] = u \\frac{dv}{dx} + v \\frac{du}{dx}$
- **Quotient Rule:** $\\frac{d}{dx}\\left[\\frac{u}{v}\\right] = \\frac{v \\frac{du}{dx} - u \\frac{dv}{dx}}{v^2}$
- **Chain Rule:** $\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}$

**Worked Example:**
Differentiate $f(x) = 3x^4 - 5x^2 + 7x - 9$:
$$f'(x) = 12x^3 - 10x + 7$$

**Checkpoint:** What is the second derivative $f''(x)$ of this function?`;
  }

  if (q.includes('integral') || q.includes('integrat') || q.includes('area under')) {
    return `### Combined Mathematics: Integration & Anti-Derivatives

**Core Principle:**
Integration reverses differentiation and calculates total accumulation or area under a curve.

**Standard Forms:**
- $\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C \\quad (n \\neq -1)$
- $\\int \\frac{1}{x} \\, dx = \\ln|x| + C$
- $\\int e^{kx} \\, dx = \\frac{1}{k}e^{kx} + C$
- $\\int \\cos(ax) \\, dx = \\frac{1}{a}\\sin(ax) + C$

**Checkpoint:** Try evaluating $\\int_0^2 (3x^2 + 4x)\\,dx$ step-by-step.`;
  }

  if (q.includes('vector') || q.includes('dot product') || q.includes('cross product') || q.includes('speed') || q.includes('velocity')) {
    return `### Vectors, Speed & Velocity Analysis

- **Speed** is a scalar quantity (magnitude only, always $\\ge 0$): $v = \\frac{\\text{distance}}{\\text{time}}$.
- **Velocity** is a vector quantity (magnitude + direction): $\\vec{v} = \\frac{d\\vec{r}}{dt}$.
- **Vector Magnitude:** For $\\vec{r} = a\\mathbf{i} + b\\mathbf{j} + c\\mathbf{k}$:
$$|\\vec{r}| = \\sqrt{a^2 + b^2 + c^2}$$
- **Scalar (Dot) Product:**
$$\\vec{A} \\cdot \\vec{B} = |\\vec{A}||\\vec{B}|\\cos\\theta$$

**Exam Tip:** Always resolve perpendicular components along orthogonal axes before summing vectors.`;
  }

  // Physics
  if (q.includes('newton') || q.includes('force') || q.includes('friction') || q.includes('momentum') || q.includes('kinetic')) {
    return `### Physics: Mechanics, Laws of Motion & Energy

- **Newton's First Law (Inertia):** $\\sum \\vec{F} = 0 \\implies \\vec{a} = 0$
- **Newton's Second Law (Dynamics):**
$$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt} = m\\vec{a}$$
- **Newton's Third Law (Action-Reaction):** $\\vec{F}_{AB} = -\\vec{F}_{BA}$
- **Kinetic Energy Derivation:** Integrating work $W = \\int_0^v m v\\,dv$ from $F = ma$:
$$E_k = \\frac{1}{2}mv^2$$

**Exam Tip:** Draw a clear Free Body Diagram first, label normal reaction $R$ and friction $F_r \\le \\mu R$, then write $\\sum F = ma$.`;
  }

  if (q.includes('ohm') || q.includes('circuit') || q.includes('resist') || q.includes('voltage') || q.includes('current') || q.includes('kirchhoff')) {
    return `### Physics: Current Electricity & Circuit Laws

- **Ohm's Law:** At constant temperature, potential difference $V$ across a metallic conductor is directly proportional to current $I$:
$$V = IR$$
- **Series Resistors:** $R_{\\text{eq}} = R_1 + R_2 + \\dots$
- **Parallel Resistors:** $\\frac{1}{R_{\\text{eq}}} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\dots$
- **Electrical Power:**
$$P = VI = I^2R = \\frac{V^2}{R}$$`;
  }

  // Chemistry
  if (q.includes('mole') || q.includes('stoichiometry') || q.includes('titrat') || q.includes('acid') || q.includes('equilibrium') || q.includes('ph')) {
    return `### Chemistry: Stoichiometry, Volumetric Analysis & Equilibrium

- **Moles from Mass:** $n = \\frac{m}{M}$
- **Moles in Solution:** $n = C \\times V$ ($V$ in $\\text{dm}^3$)
- **Titration Stoichiometry ($a\\text{A} + b\\text{B} \\rightarrow \\text{Products}$):**
$$\\frac{C_a V_a}{a} = \\frac{C_b V_b}{b}$$
- **pH Definition:** $\\text{pH} = -\\log_{10}[\\text{H}^+]$

**Worked Example:** $10.6\\text{ g}$ of $\\text{Na}_2\\text{CO}_3$ ($M_r = 106$) equals $n = \\frac{10.6}{106} = 0.10\\text{ mol}$.`;
  }

  // Biology
  if (q.includes('cell') || q.includes('dna') || q.includes('respiration') || q.includes('photosynthesis') || q.includes('enzyme')) {
    return `### Biology: Cellular Physiology & Bioenergetics

- **Aerobic Cellular Respiration:**
$$\\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2 \\longrightarrow 6\\text{CO}_2 + 6\\text{H}_2\\text{O} + 30\\text{–}32\\text{ ATP}$$
- **Key Stages:** Glycolysis (cytoplasm) $\\rightarrow$ Link Reaction & Krebs Cycle (mitochondrial matrix) $\\rightarrow$ Oxidative Phosphorylation (inner cristae; $\\text{O}_2$ is the terminal electron acceptor).
- **Photosynthesis:** Light reactions in thylakoid membranes produce ATP and NADPH to drive the Calvin Cycle in the stroma via RuBisCO.`;
  }

  // General Science EM Fallback
  return `### Zahira College Mawanella Science Project EM · Study Guide

- **Subject:** ${subject || 'Science EM'}
- **Topic:** ${topic || raw}
- **Style:** ${style.replace('_', ' ')}

**Structured Approach for G.C.E. A/L Science:**
1. **Core Definition:** State the exact textbook definitions and governing SI units clearly.
2. **Mathematical Formulation:** Write the key equation (e.g., conservation laws, rate laws, or geometric identities) and define every variable.
3. **Boundary Conditions & Verification:** Check signs, limiting cases, and dimensional consistency before concluding.

*(Answered using the built-in Science EM Study Engine. Live cloud Gemini responses require deploying the Express server via \`npm run start\` with \`GEMINI_API_KEY\` set.)*`;
}

export function generateClientStudentAssistantFallback(
  question: string,
  studentContext?: {
    assignments?: Array<{ title?: string; subject?: string; dueDate?: string; maxMarks?: number; isSubmitted?: boolean }>;
  }
): string {
  const q = (question || '').toLowerCase();
  const assignments = studentContext?.assignments || [];

  if (q.includes('assignment') || q.includes('homework') || q.includes('due') || q.includes('deadline')) {
    if (assignments.length > 0) {
      const list = assignments
        .map(
          (a) =>
            `- **[${a.subject || 'Coursework'}]** "${a.title}" — Due: **${a.dueDate}** (${a.isSubmitted ? 'Submitted' : 'Pending'}, ${a.maxMarks ?? 100} marks)`
        )
        .join('\n');
      return `### Active Coursework & Deadlines\n\n${list}`;
    }
    return `You currently have no pending assignments listed. Check the **Assignments** tab anytime for new teacher postings.`;
  }

  if (q.includes('timetable') || q.includes('schedule') || q.includes('class') || q.includes('period')) {
    return `### Zahira College Mawanella Science Project EM Weekly Schedule
- **Monday:** 08:00 Combined Mathematics | 09:45 Physics | 11:30 Chemistry
- **Tuesday:** 08:00 Chemistry | 09:45 Applied Mathematics | 11:30 ICT / English
- **Wednesday:** 08:00 Physics (Waves & Optics) | 09:45 Calculus Lab | 11:30 Science Practical
- **Thursday:** 08:00 Physics Practical | 09:45 Trigonometry | 11:30 Biology / ICT
- **Friday:** 08:00 Science Seminar & Past-Paper Review`;
  }

  if (q.includes('badge') || q.includes('xp') || q.includes('streak')) {
    return `### Zahira College Honour & Badge Criteria
- **Early-Bird Badge:** Submit assignments 24+ hours ahead of deadline.
- **Attendance Consistency:** Maintain daily roll-call attendance across morning sessions.
- **PvP Arena:** Compete in 50-question matches to climb the Science EM leaderboard.`;
  }

  return generateClientTutorFallback(question, 'Science EM', question, 'step_by_step');
}

export function generateClientTeacherAssistantFallback(
  taskType: string,
  subject: string,
  gradeLevel: string,
  topic: string
): string {
  return `### ${taskType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}: ${topic || subject}
**Cohort:** ${gradeLevel || 'Zahira College Mawanella Science Project EM'} · **Subject:** ${subject || 'Science EM'}

#### 1. Learning Objectives
- Define core syllabus concepts and SI units for **${topic || subject}**.
- Apply governing laws and mathematical derivations to G.C.E. A/L structured questions.
- Verify numerical results and experimental error margins.

#### 2. Lesson Delivery Sequence (45 Minutes)
- **00 – 05 min:** Diagnostic warm-up & prior knowledge recap.
- **05 – 20 min:** Direct instruction with worked board derivation.
- **20 – 35 min:** Guided practice using past-paper questions.
- **35 – 45 min:** Formative exit ticket & homework briefing.

*(Generated via built-in Faculty Template Engine because the backend server is not active on this static host.)*`;
}

export function generateClientPvPFallback(subjects: string[], count: number, difficulty: string) {
  const activeSubjects = subjects.length > 0 ? subjects : ['C.Maths', 'Physics', 'Chemistry'];
  const marks = difficulty === 'hard' ? 15 : difficulty === 'medium' ? 12 : 10;
  const templates = [
    (s: string, n: number) => ({
      questionText: `[${s}] Evaluate the derivative $\\frac{d}{dx}(${n + 1}x^3 - ${n}x)$ at $x = 2$.`,
      options: [`$${12 * (n + 1) - n}$`, `$${6 * (n + 1) - n}$`, `$${12 * (n + 1) + n}$`, `$${3 * (n + 1)}$`],
      correctAnswer: `$${12 * (n + 1) - n}$`,
      explanation: `Differentiating yields ${3 * (n + 1)}x^2 - ${n}; substituting x = 2 gives ${12 * (n + 1) - n}.`,
    }),
    (s: string, n: number) => ({
      questionText: `[${s}] A ${n + 2} kg block accelerates at $4\\text{ m s}^{-2}$. What resultant force acts on it?`,
      options: [`$${(n + 2) * 4}\\text{ N}$`, `$${n + 6}\\text{ N}$`, `$${(n + 2) * 2}\\text{ N}$`, `$${(n + 2) * 8}\\text{ N}$`],
      correctAnswer: `$${(n + 2) * 4}\\text{ N}$`,
      explanation: `By Newton's Second Law, F = ma = (${n + 2})(4) = ${(n + 2) * 4} N.`,
    }),
    (s: string, n: number) => ({
      questionText: `[${s}] How many moles are contained in $${((n % 5) + 1) * 0.25}\\text{ dm}^3$ of $2.0\\text{ mol dm}^{-3}$ solution?`,
      options: [
        `$${(((n % 5) + 1) * 0.5).toFixed(2)}\\text{ mol}$`,
        `$${(((n % 5) + 1) * 0.25).toFixed(2)}\\text{ mol}$`,
        `$${(((n % 5) + 1) * 1.0).toFixed(2)}\\text{ mol}$`,
        `$${(((n % 5) + 1) * 2.0).toFixed(2)}\\text{ mol}$`,
      ],
      correctAnswer: `$${(((n % 5) + 1) * 0.5).toFixed(2)}\\text{ mol}$`,
      explanation: `Moles n = C × V = 2.0 × ${(((n % 5) + 1) * 0.25).toFixed(2)} = ${(((n % 5) + 1) * 0.5).toFixed(2)} mol.`,
    }),
  ];

  return Array.from({ length: Math.min(Math.max(count, 3), 50) }, (_, idx) => {
    const sub = activeSubjects[idx % activeSubjects.length];
    const built = templates[idx % templates.length](sub, idx + 1);
    return {
      id: `pvp_local_${Date.now()}_${idx + 1}`,
      questionText: built.questionText,
      type: 'multiple_choice' as const,
      options: [...built.options].sort(() => Math.random() - 0.5),
      correctAnswer: built.correctAnswer,
      explanation: built.explanation,
      marks,
      difficulty: (difficulty as 'easy' | 'medium' | 'hard') || 'medium',
    };
  });
}
