import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, Layout, PageIntro, Toggle } from "../components/Layout";
import html2pdf from "html2pdf.js";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  KEYS,
  TOPICS_LIST,
  apiRequest,
  average,
  clearUserData,
  enrolledCourses,
  colorFor,
  getUser,
  newId,
  percent,
  seedCatalog,
  seedEnrollments,
  seedLibrary,
  seedQuizzes,
  today,
  updateCurrentUser,
  useStoredState,
  useUserState,
  write,
} from "../data/store";
import { analyzePerformance, generateFlashcards, generatePlan, generateQuiz, tutorAnswer } from "../data/aiEngine";
import "./PremiumCourse.css";

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

// Everything a student page needs to know about the student's courses.
function useMyCourses() {
  const user = getUser();
  const [catalog] = useStoredState(KEYS.catalog, seedCatalog);
  const [enrollments, setEnrollments] = useStoredState(KEYS.enrollments, seedEnrollments);
  const mine = enrolledCourses(user.email, catalog, enrollments);
  return { user, catalog, enrollments, setEnrollments, mine };
}

function Stat({ icon, label, value, note }) {
  return <div className="app-stat"><span className="app-stat-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></div>;
}

function CourseRow({ course }) {
  return (
    <div className="course-row">
      <div className={`course-avatar ${colorFor(course.category)}`}>{course.category.slice(0, 2)}</div>
      <div className="course-main"><strong>{course.title}</strong><small>{course.subtitle}</small><div className="bar"><i style={{ width: `${course.progress}%` }} /></div></div>
      <b>{course.progress}%</b>
    </div>
  );
}

function Activity({ icon, title, time }) {
  return <div className="activity-row"><span>{icon}</span><div><strong>{title}</strong><small>{time}</small></div></div>;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */


export function Dashboard() {
  const navigate = useNavigate();
  const { user, mine } = useMyCourses();

  const [tasks, setTasks] = useUserState("studyhubTasks", [
    { id: 1, text: "Review DBMS normalization", done: true },
    { id: 2, text: "Complete React hooks lesson", done: false },
    { id: 3, text: "Take today's practice quiz", done: false },
    { id: 4, text: "Review 10 flashcards", done: false },
  ]);

  const [history] = useUserState("studyhubQuizHistory", []);
  const [question, setQuestion] = useState("");

  const completed = tasks.filter((t) => t.done).length;
  const overall = average(mine.map((c) => c.progress));

  const quizAverage = history.length
    ? average(history.map((h) => percent(h.score, h.total)))
    : 0;

  const ask = () => {
    if (!question.trim()) return;
    localStorage.setItem("studyhubLastQuestion", question.trim());
    navigate("/ai-tutor");
  };

  // Recent quiz attempts, oldest to newest for the chart.
  const performanceData = [...history]
    .slice(0, 7)
    .reverse()
    .map((item, index) => ({
      name: `Attempt ${index + 1}`,
      score: percent(item.score, item.total),
      title: item.title,
    }));

  // Average score grouped by topic.
  const topicMap = {};

  history.forEach((item) => {
    const topic = item.topic || "Other";

    if (!topicMap[topic]) {
      topicMap[topic] = { totalScore: 0, attempts: 0 };
    }

    topicMap[topic].totalScore += percent(item.score, item.total);
    topicMap[topic].attempts += 1;
  });

  const subjectData = Object.entries(topicMap).map(
    ([topic, data]) => ({
      topic,
      average: Math.round(data.totalScore / data.attempts),
    })
  );

  const courseData = mine.map((course) => ({
    name: course.title,
    progress: Number(course.progress) || 0,
  }));

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Layout title="Dashboard" subtitle="Your learning overview">
      <PageIntro
        eyebrow="STUDENT DASHBOARD"
        title={`${greeting()}, ${user.name?.split(" ")[0] || "Student"}.`}
        text="Track your performance, monitor your courses and stay consistent."
        action={
          <div className="date-badge">
            <small>Today</small>
            <strong>{todayLabel}</strong>
          </div>
        }
      />

      <section className="ai-ask-panel">
        <div className="panel-heading">
          <span className="panel-icon">✦</span>
          <div>
            <strong>Ask your AI Tutor</strong>
            <p>Get explanations, examples, quizzes and summaries.</p>
          </div>
        </div>

        <div className="ask-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="What would you like to understand?"
          />
          <button onClick={ask}>Ask →</button>
        </div>

        <div className="quick-actions">
          {[
            "Explain a topic",
            "Create a quiz",
            "Summarize my notes",
            "Make flashcards",
          ].map((item) => (
            <button key={item} onClick={() => setQuestion(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      {/* Statistics */}
      <div className="stats-grid">
        <Stat icon="▣" label="Courses" value={mine.length} note="Enrolled courses" />
        <Stat icon="↗" label="Course Progress" value={`${overall}%`} note="Average progress" />
        <Stat icon="◆" label="Quiz Average" value={history.length ? `${quizAverage}%` : "—"} note={`${history.length} attempts`} />
        <Stat icon="✓" label="Today's Plan" value={`${completed}/${tasks.length}`} note="Tasks completed" />
      </div>

      {/* Quiz performance */}
      <div className="content-grid two">
        <section className="app-card dashboard-chart-card">
          <div className="card-head">
            <div>
              <span>PERFORMANCE</span>
              <h2>Quiz score trend</h2>
            </div>
            <span className="count-pill">{history.length} attempts</span>
          </div>

          {performanceData.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Score"]}
                    labelFormatter={(label) => label}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#635BEB"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon="◆"
              title="No quiz data yet"
              text="Complete a quiz to see your performance graph."
            />
          )}
        </section>

        {/* Subject performance */}
        <section className="app-card dashboard-chart-card">
          <div className="card-head">
            <div>
              <span>SUBJECT ANALYSIS</span>
              <h2>Topic-wise scores</h2>
            </div>
          </div>

          {subjectData.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={subjectData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="topic" />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(value) => [`${value}%`, "Average"]} />
                  <Bar
                    dataKey="average"
                    fill="#635BEB"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon="▣"
              title="No subject data"
              text="Topic-wise performance will appear after your quizzes."
            />
          )}
        </section>
      </div>

      {/* Courses and study plan */}
      <div className="content-grid two">
        <section className="app-card">
          <div className="card-head">
            <div>
              <span>COURSE ANALYTICS</span>
              <h2>Course progress</h2>
            </div>
            <Link to="/courses">View all →</Link>
          </div>

          {courseData.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={courseData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(value) => [`${value}%`, "Progress"]} />
                  <Bar
                    dataKey="progress"
                    fill="#635BEB"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon="▣"
              title="No enrolled courses"
              text="Enroll in a course to track your progress."
            />
          )}
        </section>

        <section className="app-card">
          <div className="card-head">
            <div>
              <span>TODAY</span>
              <h2>Study plan</h2>
            </div>
            <b className="count-pill">{completed}/{tasks.length}</b>
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <label
                key={task.id}
                className={task.done ? "task done" : "task"}
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() =>
                    setTasks((current) =>
                      current.map((item) =>
                        item.id === task.id
                          ? { ...item, done: !item.done }
                          : item
                      )
                    )
                  }
                />
                <span>{task.text}</span>
              </label>
            ))}
          </div>

          <Link className="text-link" to="/planner">
            Open planner →
          </Link>
        </section>
      </div>

      {/* Recent activity */}
      <section className="app-card">
        <div className="card-head">
          <div>
            <span>RECENT ACTIVITY</span>
            <h2>Latest quiz attempts</h2>
          </div>
          <Link to="/quiz">Practice quiz →</Link>
        </div>

        <div className="activity-list">
          {history.length ? (
            history.slice(0, 5).map((item) => (
              <Activity
                key={item.id}
                icon="◆"
                title={`Scored ${percent(item.score, item.total)}% on ${item.title}`}
                time={item.date}
              />
            ))
          ) : (
            <EmptyState
              icon="◆"
              title="No activity yet"
              text="Take a quiz to see your recent activity."
            />
          )}
        </div>
      </section>
    </Layout>
  );
}


/* ------------------------------------------------------------------ */
/* AI Tutor                                                            */
/* ------------------------------------------------------------------ */

export function AITutor() {
  const [messages, setMessages] = useUserState("studyhubChat", []);
  const [input, setInput] = useState(localStorage.getItem("studyhubLastQuestion") || "");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("checking"); // checking | live | local
  const [notice, setNotice] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    apiRequest("/api/ai/status").then((s) => setMode(s.configured ? "live" : "local")).catch(() => setMode("local"));
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    localStorage.removeItem("studyhubLastQuestion");
    const history = [...messages, { role: "user", text }];
    setMessages(history);
    setInput("");
    setNotice("");
    setBusy(true);

    let reply;
    try {
      const data = await apiRequest("/api/ai/chat", { method: "POST", body: JSON.stringify({ messages: history.slice(-12) }) });
      reply = data.reply;
    } catch (error) {
      // Real AI unavailable (no key, rate limit, offline): answer with the built-in local tutor instead.
      reply = tutorAnswer(text);
      setNotice(mode === "live" ? `AI provider unavailable (${error.message}). Showing a local answer.` : "");
    }
    setMessages([...history, { role: "ai", text: reply }]);
    setBusy(false);
  };

  const live = mode === "live";

  return (
    <Layout title="AI Tutor" subtitle="Ask, understand, practice">
      <PageIntro eyebrow="AI LEARNING ASSISTANT" title="Ask your AI Tutor" text={live ? "Answers are generated by Gemini through the StudyHub server." : "The server has no AI key configured, so the built-in local tutor is answering."} />
      <div className="tutor-layout">
        <section className="app-card tutor-chat">
          <div className="chat-header"><span className="panel-icon">✦</span><div><strong>StudyHub Tutor</strong><small>{live ? "Powered by Gemini" : "Local demo mode"}</small></div><span className="online">● Online</span></div>
          <div className="chat-body" ref={bodyRef}>
            {messages.length === 0 && <div className="chat-welcome"><div>✦</div><h2>What are you studying?</h2><p>Try: “Explain database normalization” or “Give me a quiz on React hooks.”</p></div>}
            {messages.map((m, i) => <div key={i} className={`chat-bubble ${m.role}`}>{m.role === "ai" && <b>✦ AI Tutor</b>}<p>{m.text}</p></div>)}
            {busy && <div className="chat-bubble ai"><b>✦ AI Tutor</b><p><span className="typing-dots"><i /><i /><i /></span></p></div>}
          </div>
          {notice && <div className="error-banner" role="alert"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
          <div className="chat-input"><input value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask anything about your studies..." /><button onClick={send} disabled={busy || !input.trim()}>{busy ? "Thinking..." : "Send"}</button></div>
        </section>
        <aside className="app-card tutor-side">
          <span className="card-kicker">QUICK PROMPTS</span>
          {["Explain in simple terms", "Give me an example", "Create 5 MCQs", "Summarize this topic", "Make revision notes"].map((p) => <button key={p} onClick={() => setInput(p)}>{p}<span>→</span></button>)}
          {!live && mode !== "checking" && <div className="demo-warning">Add GEMINI_API_KEY to server/.env to switch on real AI answers.</div>}
        </aside>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Courses: enrolled courses + catalog created by teachers             */
/* ------------------------------------------------------------------ */

const PREMIUM_LESSONS = {
  "premium-web-demo": [
    {
      title: "Lesson 1: Introduction to Full-Stack Development",
      content:
        "Full-stack development covers frontend interfaces, backend logic, APIs and databases. React builds the interface, Node.js runs JavaScript on the server, Express handles HTTP routes, and MongoDB stores application data.",
      objectives: [
        "Understand frontend and backend development",
        "Learn the MERN stack components",
        "Understand how a web request reaches a database",
      ],
    },
    {
      title: "Lesson 2: React Fundamentals",
      content:
        "React builds interfaces from reusable components. JSX describes the UI, props pass data to components, and useState manages changing values. Events such as onClick let users interact with the page.",
      objectives: [
        "Understand components and JSX",
        "Use props to pass information",
        "Understand state and event handlers",
      ],
    },
    {
      title: "Lesson 3: Node.js and Express APIs",
      content:
        "Node.js runs JavaScript outside the browser. Express helps build HTTP endpoints. An API route receives a request, validates input, performs application logic and returns a JSON response.",
      objectives: [
        "Understand Node.js and Express",
        "Learn GET and POST requests",
        "Understand JSON API responses",
      ],
    },
    {
      title: "Lesson 4: MongoDB Basics",
      content:
        "MongoDB is a document database. It stores records as BSON documents inside collections. In a MERN application, the backend uses a database driver or Mongoose models to read and update data.",
      objectives: [
        "Understand documents and collections",
        "Learn basic CRUD operations",
        "Understand the role of Mongoose",
      ],
    },
  ],
  "premium-security-demo": [
    {
      title: "Lesson 1: Introduction to Cybersecurity",
      content:
        "Cybersecurity protects systems, networks and information against unauthorized access and disruption. The CIA triad describes confidentiality, integrity and availability.",
      objectives: [
        "Understand cybersecurity fundamentals",
        "Learn the CIA triad",
        "Identify common security risks",
      ],
    },
    {
      title: "Lesson 2: Network Security",
      content:
        "Network security uses controls such as firewalls, secure protocols, network segmentation and monitoring to reduce unauthorized access and protect data in transit.",
      objectives: [
        "Understand firewalls",
        "Learn why HTTPS matters",
        "Recognize the purpose of network monitoring",
      ],
    },
    {
      title: "Lesson 3: Web Application Security",
      content:
        "Web applications should validate inputs, authorize every protected operation, store passwords using a suitable password-hashing algorithm, and protect secrets on the server. Parameterized database queries help prevent injection attacks.",
      objectives: [
        "Understand input validation",
        "Distinguish authentication from authorization",
        "Learn basic injection prevention",
      ],
    },
    {
      title: "Lesson 4: Account and Data Protection",
      content:
        "Use unique passwords, multi-factor authentication, least-privilege access, secure backups and timely software updates. Never expose private API keys or database credentials in frontend code.",
      objectives: [
        "Understand least privilege",
        "Learn account protection practices",
        "Keep application secrets on the server",
      ],
    },
  ],
};


export function Courses() {
  const { user, catalog, enrollments, setEnrollments, mine } = useMyCourses();
  const navigate = useNavigate();
  const [tab, setTab] = useState("mine");
  const [filter, setFilter] = useState("All");

const premiumDemoCourses = [
  {
    id: "premium-web-demo",
    title: "Full-Stack Web Development",
    subtitle: "React, Node.js & MongoDB",
    category: "Web",
    description:
      "Learn frontend development, backend APIs, React, Node.js and MongoDB through practical projects.",
    status: "approved",
    premium: true,
    demoPrice: 99,
    teacherName: "AI StudyHub",
  },
  {
    id: "premium-security-demo",
    title: "Cybersecurity Fundamentals",
    subtitle: "Network & Web Security",
    category: "Other",
    description:
      "Learn network security, common web vulnerabilities and security best practices.",
    status: "approved",
    premium: true,
    demoPrice: 99,
    teacherName: "AI StudyHub",
  },
];

const approved = [
  ...catalog.filter((c) => c.status === "approved"),
  ...premiumDemoCourses.filter(
    (demo) => !catalog.some((course) => course.id === demo.id)
  ),
];

  const list = tab === "mine" ? mine : approved;
  const visible = filter === "All" ? list : list.filter((c) => c.category === filter);
  const categories = ["All", ...new Set(list.map((c) => c.category))];

  const isEnrolled = (id) => enrollments.some((e) => e.email === user.email && e.courseId === id);
  const enroll = (id) => setEnrollments([...enrollments, { id: newId(), email: user.email, courseId: id, progress: 0 }]);
  const leave = (id) => setEnrollments(enrollments.filter((e) => !(e.email === user.email && e.courseId === id)));
  const addProgress = (id) => setEnrollments(enrollments.map((e) => (e.email === user.email && e.courseId === id ? { ...e, progress: Math.min(100, e.progress + 10) } : e)));

  return (
    <Layout title="Courses" subtitle="Manage your learning">
      <PageIntro eyebrow="MY LEARNING" title="Courses" text="Track your courses or enroll in new ones created by teachers." />
      <div className="filter-row">
        <button className={tab === "mine" ? "selected" : ""} onClick={() => { setTab("mine"); setFilter("All"); }}>My courses ({mine.length})</button>
        <button className={tab === "browse" ? "selected" : ""} onClick={() => { setTab("browse"); setFilter("All"); }}>Browse catalog ({approved.length})</button>
      </div>
      <div className="filter-row">{categories.map((x) => <button className={filter === x ? "selected" : ""} key={x} onClick={() => setFilter(x)}>{x}</button>)}</div>

      {visible.length === 0 ? (
        <div className="app-card"><EmptyState icon="▣" title={tab === "mine" ? "No enrolled courses" : "No courses found"} text={tab === "mine" ? "Open “Browse catalog” to enroll in a course." : "Try another category."} /></div>
      ) : (
        <div className="course-grid">
          {visible.map((course) => (
            <article className="course-card" key={course.id}>
              <div className={`course-avatar large ${colorFor(course.category)}`}>{course.category.slice(0, 2)}</div>
              <span className="course-category">{course.category} · by {course.teacherName}</span>
<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <span className="course-category">{course.category}</span>
  {course.premium && (
    <span className="course-category">✦ PREMIUM DEMO</span>
  )}
</div>

<h2>{course.title}</h2>
<p>{course.subtitle}</p>

{course.premium && (
  <p>
    <strong>₹99 one-time payment</strong>
    {" · Razorpay Test Mode"}
  </p>
)}
              {tab === "mine" ? (
                <>
                  <div className="bar"><i style={{ width: `${course.progress}%` }} /></div>
                  <div className="course-footer">
                    <span>{course.progress}% complete</span>
                    <span className="row-actions"><button onClick={() => addProgress(course.id)}>+10%</button><button onClick={() => leave(course.id)}>Leave</button></span>
                  </div>
                </>
              ) : (
                <div className="course-footer">
                  <span>{course.description}</span>
                  

{course.premium ? (
  <button
    onClick={() =>
      navigate(`/premium-course?id=${encodeURIComponent(course.id)}`)
    }
  >
    Start learning →
  </button>
) : isEnrolled(course.id) ? (
  <b>Enrolled ✓</b>
) : (
  <button onClick={() => enroll(course.id)}>
    Enroll
  </button>
)}


                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}

export function PremiumCourseViewer() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("id");

  const downloadCertificate = async () => {
  if (!certificateRef.current || downloading) return;

  setDownloading(true);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    // Capture the certificate where it is, so all page CSS still applies.
    const canvas = await html2canvas(certificateRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    const image = canvas.toDataURL("image/jpeg", 0.98);

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Fit the certificate on one page, keeping its proportions.
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;

    pdf.addImage(image, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
    pdf.save(`AI-StudyHub-${course.title.replace(/[^a-z0-9]/gi, "-")}-Certificate.pdf`);
  } catch (error) {
    console.error("Certificate PDF error:", error);
    window.alert("Could not download certificate. Please try again.");
  } finally {
    setDownloading(false);
  }
};

  const courseInfo = {
    "premium-web-demo": {
      title: "Full-Stack Web Development",
      category: "Web Development",
    },
    "premium-security-demo": {
      title: "Cybersecurity Fundamentals",
      category: "Cybersecurity",
    },
  };

  const course = courseInfo[courseId];
  const lessons = PREMIUM_LESSONS[courseId] || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const certificateRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!course) {
      setCheckingAccess(false);
      return () => {
        active = false;
      };
    }

    setCheckingAccess(true);
    apiRequest(`/api/payments/access/${encodeURIComponent(courseId)}`)
      .then((result) => {
        if (active) setHasAccess(Boolean(result.hasAccess));
      })
      .catch((error) => {
        if (active) {
          setHasAccess(false);
          setPaymentError(error.message || "Could not check course access. Please sign in and try again.");
        }
      })
      .finally(() => {
        if (active) setCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, [courseId]);

  const handlePurchase = async () => {
    if (paying) return;

    setPaying(true);
    setPaymentError("");

    try {
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout did not load. Refresh the page and try again.");
      }

      const order = await apiRequest("/api/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ courseId }),
      });

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "AI StudyHub",
        description: order.courseTitle,
        order_id: order.orderId,
        handler: async (response) => {
          try {
            const result = await apiRequest("/api/payments/verify", {
              method: "POST",
              body: JSON.stringify(response),
            });

            if (!result.verified) {
              throw new Error("The payment could not be verified. Course access has not been granted.");
            }

            setHasAccess(true);
            setPaymentError("");
          } catch (error) {
            setPaymentError(
              error.message || "Payment verification failed. If you were charged, please contact support."
            );
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
        theme: {
          color: "#5b4ee8",
        },
      };

      const checkout = new window.Razorpay(options);
      checkout.on("payment.failed", (event) => {
        setPaymentError(
          event.error?.description || "Payment failed. Please try again."
        );
        setPaying(false);
      });
      checkout.open();
    } catch (error) {
      setPaymentError(error.message || "Unable to start checkout.");
      setPaying(false);
    }
  };

  if (!course || !lessons.length) {
    return (
      <Layout title="Course" subtitle="Learning">
        <section className="app-card">
          <h2>Course not found</h2>
          <Link to="/courses">Back to courses</Link>
        </section>
      </Layout>
    );
  }

  if (checkingAccess) {
    return (
      <Layout title="Course" subtitle={course.category}>
        <section className="app-card">
          <h2>Checking course access…</h2>
          <p>Please wait while we confirm your purchase status.</p>
        </section>
      </Layout>
    );
  }

  if (!hasAccess) {
    return (
      <Layout title="Premium course" subtitle={course.category}>
        <div className="premium-course-page">
      <PageIntro
          eyebrow="PREMIUM COURSE"
          title={course.title}
          text="Purchase this course to unlock its lessons. Payments are currently in Razorpay Test Mode."
        />
        <section className="app-card premium-unlock-card">
          <h2>Unlock this course</h2>
          <p>One-time demo price: <strong>₹99</strong></p>
          <p>Your course will unlock only after the server verifies the payment.</p>
          {paymentError && (
            <p className="error-banner" role="alert">{paymentError}</p>
          )}
          <button
            type="button"
            className="primary-btn"
            onClick={handlePurchase}
            disabled={paying}
          >
            {paying ? "Processing…" : "Pay ₹99 and unlock course"}
          </button>
          <p style={{ marginTop: 16 }}>
            <Link to="/courses">← Back to courses</Link>
          </p>
        </section>
      </div>
      </Layout>
    );
  }

  const lesson = lessons[activeIndex];

  return (
    <Layout title="Course lessons" subtitle={course.category}>
      <div className="premium-course-page">
      <PageIntro
        eyebrow="PREMIUM COURSE · UNLOCKED"
        title={course.title}
        text="Your purchase is confirmed. Explore the lessons at your own pace."
      />

      <div className="premium-course-grid content-grid two">
        <section className="app-card premium-lesson-card">
          <span className="course-category">
            LESSON {activeIndex + 1} OF {lessons.length}
          </span>

          <h2>{lesson.title}</h2>
          <p>{lesson.content}</p>

          <h3>Learning objectives</h3>
          <ul>
            {lesson.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>

          <button
            className="primary-btn"
            onClick={() =>
              setCompleted((current) =>
                current.includes(activeIndex)
                  ? current
                  : [...current, activeIndex]
              )
            }
          >
            {completed.includes(activeIndex)
              ? "Lesson completed ✓"
              : "Mark lesson complete"}
          </button>

          <div className="course-footer premium-course-footer">
            <button
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex((index) => index - 1)}
            >
              ← Previous
            </button>
            <button
              disabled={activeIndex === lessons.length - 1}
              onClick={() => setActiveIndex((index) => index + 1)}
            >
              Next lesson →
            </button>
          </div>
        </section>

        <aside className="app-card premium-syllabus-card">
          <h2>Course syllabus</h2>
          {lessons.map((item, index) => (
            <button
              key={item.title}
              aria-current={index === activeIndex ? "step" : undefined}
              className={`full-btn premium-syllabus-item${index === activeIndex ? " is-active" : ""}${completed.includes(index) ? " is-complete" : ""}`}
              onClick={() => setActiveIndex(index)}
            >
              {completed.includes(index) ? "✓ " : ""}
              {index + 1}. {item.title}
            </button>
          ))}
          <div className="premium-progress" aria-label="Course completion progress">
            <div className="premium-progress-heading">
              <span>Course progress</span>
              <strong>{Math.round((completed.length / lessons.length) * 100)}%</strong>
            </div>
            <div
              className="premium-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={lessons.length}
              aria-valuenow={completed.length}
              aria-label={`${completed.length} of ${lessons.length} lessons completed`}
            >
              <span style={{ width: `${(completed.length / lessons.length) * 100}%` }} />
            </div>
            <p className="premium-progress-caption">
              {completed.length} of {lessons.length} lessons completed
            </p>
          </div>
          <Link className="premium-back-link" to="/courses">← Back to courses</Link>
        </aside>
      </div>

      {completed.length === lessons.length && lessons.length > 0 && (
        <section className="course-certificate-section" aria-live="polite">
          <div className="certificate-ready-banner">
            <span className="certificate-ready-icon" aria-hidden="true">✓</span>
            <div>
              <h2>Congratulations! You completed the course.</h2>
              <p>Your certificate is ready. You can print it or save it as a PDF.</p>
            </div>
          </div>
          <article
  ref={certificateRef}
  className="course-certificate"
  aria-label="Course completion certificate"
>
            <div className="certificate-inner-border">
              <div className="certificate-brand">✦ AI STUDYHUB</div>
              <div className="certificate-overline">CERTIFICATE OF COMPLETION</div>
              <h2>Certificate</h2>
              <p className="certificate-intro">This certificate is proudly presented to</p>
              <div className="certificate-student">{getUser()?.name || "Student"}</div>
              <p className="certificate-description">for successfully completing the course</p>
              <h3 className="certificate-course-title">{course.title}</h3>
              <p className="certificate-date">Completed on {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
              <div className="certificate-bottom">
                <div className="certificate-seal" aria-label="Course completed">✓</div>
                <div className="certificate-signature">
                  <span>AI StudyHub</span>
                  <small>Learning Platform</small>
                </div>
              </div>
            </div>
          </article>
          <div className="certificate-actions">
           <button
  type="button"
  className="primary-btn"
  onClick={downloadCertificate}
  disabled={downloading}
>
  {downloading ? "Generating PDF..." : "↓ Download Certificate"}
</button>
            <p>Your certificate will download directly as a one-page PDF.</p>
          </div>
        </section>
      )}
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Materials: teacher content for enrolled courses + private uploads   */
/* ------------------------------------------------------------------ */

export function Materials() {
  const navigate = useNavigate();
  const { user, catalog, mine } = useMyCourses();
  const [library, setLibrary] = useStoredState(KEYS.library, seedLibrary);
  const [query, setQuery] = useState("");

  const enrolledIds = mine.map((c) => c.id);
  const available = library.filter((m) => (m.scope === "course" && enrolledIds.includes(m.courseId)) || (m.scope === "private" && m.uploaderEmail === user.email));
  const filtered = available.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  const add = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Only the file details are saved for now. Real file storage comes with the backend.
    setLibrary([{ id: newId(), name: file.name, type: file.name.split(".").pop().toUpperCase(), size: `${Math.max(1, Math.round(file.size / 1024))} KB`, scope: "private", uploaderEmail: user.email, uploaderName: user.name, date: today() }, ...library]);
    e.target.value = "";
  };

  const askAI = (name) => {
    localStorage.setItem("studyhubLastQuestion", `Summarize ${name}`);
    navigate("/ai-tutor");
  };

  const courseName = (id) => catalog.find((c) => c.id === id)?.title || "Course";

  return (
    <Layout title="Materials" subtitle="Your study library">
      <PageIntro eyebrow="STUDY LIBRARY" title="Study materials" text="Materials shared by your teachers, plus your own uploads." action={<label className="primary-btn upload-label">+ Upload file<input type="file" hidden onChange={add} /></label>} />
      <div className="toolbar"><input placeholder="Search materials..." value={query} onChange={(e) => setQuery(e.target.value)} /><span>{filtered.length} files</span></div>
      <div className="app-card material-list">
        {filtered.length ? filtered.map((m) => (
          <div className="material-row" key={m.id}>
            <span className="file-icon">{m.type.slice(0, 3)}</span>
            <div><strong>{m.name}</strong><small>{m.type} · {m.size} · {m.scope === "course" ? `${courseName(m.courseId)} · ${m.uploaderName}` : "Private"}</small></div>
            <span className="row-actions">
              <button className="small-btn" onClick={() => askAI(m.name)}>✦ Ask AI</button>
              {m.scope === "private" && <button className="danger-btn" onClick={() => setLibrary(library.filter((x) => x.id !== m.id))}>Delete</button>}
            </span>
          </div>
        )) : <EmptyState icon="□" title="No materials found" text="Enroll in a course or upload a file." />}
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Quiz: AI generated quizzes + quizzes created by teachers            */
/* ------------------------------------------------------------------ */

export function Quiz() {
  const { catalog, mine, enrollments, setEnrollments } = useMyCourses();

  const [quizzes] = useStoredState(KEYS.quizzes, seedQuizzes);
  const [history, setHistory] = useUserState("studyhubQuizHistory", []);

  const [topic, setTopic] = useState("Mixed");
  const [active, setActive] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  const enrolledIds = mine.map((c) => c.id);

  const teacherQuizzes = quizzes.filter(
    (q) => enrolledIds.includes(q.courseId)
  );

  /*
   * Start a quiz.
   *
   * courseId is important because teacher-created quizzes belong
   * to a specific course. AI-generated quizzes do not necessarily
   * belong to a course, so their courseId remains null.
   */
  const start = (quiz) => {
    setActive(quiz);
    setIndex(0);
    setAnswers([]);
    setResult(null);
  };

  /*
   * Generate an AI quiz.
   */




const startGenerated = async () => {
  setGenerating(true);

  try {
    const data = await apiRequest("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({
        type: "quiz",
        topic,
        count: 5,
      }),
    });

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("Gemini returned no quiz questions.");
    }

    start({
      title:
        topic === "Mixed"
          ? "Mixed Computer Science Quiz"
          : `${topic} Quiz`,
      topic,
      quizId: null,
      courseId: null,
      questions: data.items,
    });

  } catch (error) {
    console.error("Gemini quiz generation failed:", error);

    window.alert(
      error.message || "Unable to generate quiz. Please try again."
    );
  } finally {
    setGenerating(false);
  }
};




  /*
   * Finish quiz.
   *
   * 1. Calculate score
   * 2. Save attempt to MongoDB through useUserState()
   * 3. If this is a course quiz, update course progress
   */
  const finish = (finalAnswers) => {
    const score = finalAnswers.reduce(
      (totalScore, answer, questionIndex) =>
        totalScore +
        (answer === active.questions[questionIndex].answer ? 1 : 0),
      0
    );

    const total = active.questions.length;

    const attempt = {
      id: newId(),
      title: active.title,
      topic: active.topic,
      quizId: active.quizId,
      courseId: active.courseId || null,
      score,
      total,
      date: today(),
    };

    /*
     * Save quiz attempt.
     *
     * useUserState() persists this to:
     * MongoDB -> quizHistory
     */
    setHistory((currentHistory) => [
      attempt,
      ...currentHistory,
    ]);

    /*
     * Update course progress only when the quiz belongs
     * to an enrolled course.
     *
     * Progress contribution:
     * - 100% quiz = +20%
     * - 75% quiz  = +15%
     * - 50% quiz  = +10%
     * - 25% quiz  = +5%
     * - 0% quiz   = +0%
     */
    if (active.courseId) {
      const progressIncrease =
        total > 0
          ? Math.round((score / total) * 20)
          : 0;

      if (progressIncrease > 0) {
        setEnrollments((currentEnrollments) =>
          currentEnrollments.map((enrollment) => {
            if (
              enrollment.courseId === active.courseId &&
              enrollment.email === getUser().email
            ) {
              return {
                ...enrollment,
                progress: Math.min(
                  100,
                  (enrollment.progress || 0) + progressIncrease
                ),
              };
            }

            return enrollment;
          })
        );
      }
    }

    setResult({
      ...attempt,
      progressIncrease:
        active.courseId && total > 0
          ? Math.round((score / total) * 20)
          : 0,
    });

    setActive(null);
  };

  /*
   * Select an answer.
   */
  const choose = (option) => {
    const nextAnswers = [...answers, option];

    if (index === active.questions.length - 1) {
      finish(nextAnswers);
    } else {
      setAnswers(nextAnswers);
      setIndex(index + 1);
    }
  };

  /*
   * Quiz history display.
   */
  const historyList = (list) =>
    list.map((attempt) => (
      <div className="history-row" key={attempt.id}>
        <span>◆</span>

        <div>
          <strong>
            {attempt.score}/{attempt.total} · {attempt.title}
          </strong>

          <small>{attempt.date}</small>
        </div>

        <b>
          {percent(attempt.score, attempt.total)}%
        </b>
      </div>
    ));

  let body;

  /*
   * ACTIVE QUIZ
   */
  if (active) {
    const question = active.questions[index];

    body = (
      <section className="app-card quiz-card">
        <div className="quiz-progress">
          <span>
            {active.title} · Question {index + 1} of{" "}
            {active.questions.length}
          </span>

          <div>
            <i
              style={{
                width: `${
                  ((index + 1) / active.questions.length) * 100
                }%`,
              }}
            />
          </div>
        </div>

        <h2>{question.q}</h2>

        <div className="option-grid">
          {question.options.map((option, optionIndex) => (
            <button
              key={option}
              onClick={() => choose(optionIndex)}
            >
              {String.fromCharCode(65 + optionIndex)}. {option}
            </button>
          ))}
        </div>
      </section>
    );
  }

  /*
   * RESULT SCREEN
   */
  else if (result) {
    body = (
      <section className="app-card result-card">
        <div className="quiz-symbol">◆</div>

        <h2>{result.title}</h2>

        <div className="result-score">
          {result.score}/{result.total}
        </div>

        <p>
          You scored{" "}
          <strong>
            {percent(result.score, result.total)}%
          </strong>
          .
        </p>

        {result.courseId && result.progressIncrease > 0 && (
          <p>
            Course progress increased by{" "}
            <strong>
              +{result.progressIncrease}%
            </strong>
            .
          </p>
        )}

        {result.courseId && result.progressIncrease === 0 && (
          <p>
            Complete more questions correctly to increase
            your course progress.
          </p>
        )}

        <button
          className="primary-btn"
          onClick={() => setResult(null)}
        >
          Back to quizzes
        </button>
      </section>
    );
  }

  /*
   * QUIZ HOME
   */
  else {
    body = (
      <div className="content-grid two">
        <div className="stack">

          {/* AI GENERATED QUIZ */}
          <section className="app-card quiz-start">
            <div className="quiz-symbol">✦</div>

            <h2>Generate a quiz</h2>

            <p>
              The AI builds 5 questions on the topic you choose.
            </p>

            <select
              className="select-input inline-select"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              {["Mixed", ...TOPICS_LIST].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <button
              className="primary-btn"
              disabled={generating}
              onClick={startGenerated}
            >
              {generating
                ? "Generating..."
                : "Start quiz →"}
            </button>
          </section>

          {/* TEACHER QUIZZES */}
          <section className="app-card">
            <div className="card-head">
              <div>
                <span>FROM YOUR TEACHERS</span>
                <h2>Course quizzes</h2>
              </div>
            </div>

            {teacherQuizzes.length ? (
              teacherQuizzes.map((quiz) => {
                const course = catalog.find(
                  (item) => item.id === quiz.courseId
                );

                return (
                  <div
                    className="history-row"
                    key={quiz.id}
                  >
                    <span>◆</span>

                    <div>
                      <strong>{quiz.title}</strong>

                      <small>
                        {course?.title} ·{" "}
                        {quiz.questions.length} questions
                      </small>
                    </div>

                    <button
                      className="small-btn primary"
                      onClick={() =>
                        start({
                          title: quiz.title,
                          topic: course?.category,
                          quizId: quiz.id,
                          courseId: quiz.courseId,
                          questions: quiz.questions,
                        })
                      }
                    >
                      Start
                    </button>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon="◆"
                title="No course quizzes"
                text="Quizzes from your enrolled courses appear here."
              />
            )}
          </section>
        </div>

        {/* HISTORY */}
        <section className="app-card">
          <div className="card-head">
            <div>
              <span>HISTORY</span>
              <h2>Recent attempts</h2>
            </div>
          </div>

          {history.length ? (
            historyList(history.slice(0, 6))
          ) : (
            <EmptyState
              icon="◆"
              title="No attempts yet"
              text="Complete your first quiz to see your results here."
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <Layout
      title="Quiz"
      subtitle="Practice and test yourself"
    >
      <PageIntro
        eyebrow="PRACTICE CENTER"
        title="Smart quizzes"
        text="Practise with AI-generated questions or take quizzes created by your teachers."
      />

      {body}
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Flashcards                                                          */
/* ------------------------------------------------------------------ */


export function Flashcards() {
  const [cards, setCards] = useUserState("studyhubFlashcards", [
    {
      id: 1,
      question: "What is normalization in DBMS?",
      answer:
        "Normalization organizes database tables to reduce redundancy and improve data integrity.",
    },
    {
      id: 2,
      question: "What does API stand for?",
      answer: "Application Programming Interface.",
    },
    {
      id: 3,
      question: "What is React?",
      answer: "React is a JavaScript library for building user interfaces.",
    },
  ]);

  const [current, setCurrent] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const generateCards = async (event) => {
    event.preventDefault();

    if (!topic.trim()) {
      setError("Please enter a topic first.");
      return;
    }

    setGenerating(true);
    setError("");

    try {
      const data = await apiRequest("/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          type: "flashcards",
          topic: topic.trim(),
          count: Number(count),
        }),
      });

      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("The AI did not return any flashcards.");
      }

      const generatedCards = data.items.map((item, index) => ({
        id: `${Date.now()}-${index}`,
        question: item.question || item.front || item.term,
        answer: item.answer || item.back || item.definition,
      })).filter((item) => item.question && item.answer);

      if (!generatedCards.length) {
        throw new Error("The returned flashcard format was not recognized.");
      }

      setCards(generatedCards);
      setCurrent(0);
      setShowAnswer(false);
    } catch (err) {
      setError(
        err.message ||
          "Could not generate flashcards. Please check your AI backend."
      );
    } finally {
      setGenerating(false);
    }
  };

  const card = cards[current];

  const nextCard = () => {
    setShowAnswer(false);
    setCurrent((value) => (value + 1) % cards.length);
  };

  const previousCard = () => {
    setShowAnswer(false);
    setCurrent((value) => (value - 1 + cards.length) % cards.length);
  };

  return (
    <Layout title="Flashcards" subtitle="Revise faster">
      <PageIntro
        eyebrow="AI-POWERED REVISION"
        title="Flashcards"
        text="Generate study cards from any topic and test your knowledge."
      />

      <section className="app-card">
        <div className="card-head">
          <div>
            <span>AI FLASHCARD GENERATOR</span>
            <h2>Create a new deck</h2>
          </div>
        </div>

        <form
  className="flashcard-form"
  onSubmit={generateCards}
  aria-busy={generating}
>
  <div className="form-field">
    <div className="form-label-row">
      <label htmlFor="flashcard-topic">Study topic</label>
      <span className="char-count">{topic.length}/200</span>
    </div>
    <input
      id="flashcard-topic"
      type="text"
      value={topic}
      onChange={(event) => setTopic(event.target.value)}
      placeholder="e.g. DBMS Normalization"
      maxLength={200}
      disabled={generating}
      autoComplete="off"
      required
    />
  </div>

  <fieldset className="form-field" disabled={generating}>
    <legend>Number of cards</legend>
    <div className="segmented" role="radiogroup">
      {[5, 10, 15].map((n) => (
        <label
          key={n}
          className={`segment${Number(count) === n ? " selected" : ""}`}
        >
          <input
            type="radio"
            name="flashcard-count"
            value={n}
            checked={Number(count) === n}
            onChange={(event) => setCount(event.target.value)}
          />
          {n}
        </label>
      ))}
    </div>
  </fieldset>

  <button
    type="submit"
    className="primary-btn"
    disabled={generating || !topic.trim()}
  >
    {generating ? "Generating..." : "✦ Generate with AI"}
  </button>
</form>

        {error && (
          <p role="alert" style={{ color: "#ef4444", marginTop: 12 }}>
            {error}
          </p>
        )}
      </section>

      {cards.length > 0 && card && (
        <>
          <section className="app-card flashcard-section">
            <div className="card-head">
              <div>
                <span>
                  CARD {current + 1} / {cards.length}
                </span>
                <h2>Active recall</h2>
              </div>
            </div>

            <button
              type="button"
              className={`flashcard ${showAnswer ? "revealed" : ""}`}
              onClick={() => setShowAnswer((value) => !value)}
            >
              <span className="flashcard-label">
                {showAnswer ? "ANSWER" : "QUESTION"}
              </span>
              <strong>
                {showAnswer ? card.answer : card.question}
              </strong>
              {!showAnswer && (
                <small>Click to reveal answer</small>
              )}
            </button>

            <div className="flashcard-controls">
              <button
                type="button"
                className="secondary-btn"
                onClick={previousCard}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={nextCard}
              >
                Next →
              </button>
            </div>
          </section>

          <section className="app-card">
            <div className="card-head">
              <div>
                <span>YOUR DECK</span>
                <h2>All flashcards</h2>
              </div>
            </div>

            <div className="flashcard-grid">
              {cards.map((item, index) => (
                <button
                  type="button"
                  className={`flashcard-mini ${
                    index === current ? "active" : ""
                  }`}
                  key={item.id}
                  onClick={() => {
                    setCurrent(index);
                    setShowAnswer(false);
                  }}
                >
                  <span>#{index + 1}</span>
                  <strong>{item.question}</strong>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}


/* ------------------------------------------------------------------ */
/* Study planner                                                       */
/* ------------------------------------------------------------------ */

export function Planner() {
  const { mine } = useMyCourses();

  const [tasks, setTasks] = useUserState("studyhubPlanner", [
    {
      id: 1,
      time: "10:00",
      title: "DBMS normalization",
      duration: "45 min",
      done: false,
    },
    {
      id: 2,
      time: "15:00",
      title: "React Hooks revision",
      duration: "60 min",
      done: true,
    },
    {
      id: 3,
      time: "19:00",
      title: "Practice quiz",
      duration: "30 min",
      done: false,
    },
  ]);

  const [generating, setGenerating] = useState(false);
  const [planError, setPlanError] = useState("");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("18:00");

  const byTime = (list) =>
    [...list].sort((a, b) => a.time.localeCompare(b.time));

  const add = () => {
    if (!title.trim()) return;

    setTasks(
      byTime([
        ...tasks,
        {
          id: newId(),
          time,
          title: title.trim(),
          duration: "30 min",
          done: false,
        },
      ])
    );

    setTitle("");
  };

  const generate = async () => {
  if (generating) return;

  setGenerating(true);
  setPlanError("");

  try {
    const fresh = await generatePlan(mine);

    setTasks((currentTasks) => {
      const existing = new Set(
        currentTasks.map((task) => `${task.time}|${task.title}`)
      );

      const additions = fresh
        .filter((task) => !existing.has(`${task.time}|${task.title}`))
        .map((task) => ({
          ...task,
          id: newId(),
        }));

      return byTime([...currentTasks, ...additions]);
    });
  } catch (error) {
    console.error("AI PLANNER ERROR:", error);
    setPlanError(error.message || "Could not generate your study plan.");
  } finally {
    setGenerating(false);
  }
};
  return (
    <Layout title="Study Planner" subtitle="Plan your next session">
      <PageIntro
        eyebrow="DAILY PLAN"
        title="Study planner"
        text="Create study blocks yourself or let the AI build a plan from your courses."
        action={
         <button
  className="primary-btn"
  onClick={generate}
  disabled={generating}
>
  {generating ? "Generating with Groq..." : "✦ Generate AI plan"}
</button>
        }
      />
 {planError && (
        <p role="alert" className="planner-error">
          {planError}
        </p>
      )}
      <div className="planner-layout">
        <section className="app-card">
          <div className="card-head">
            <div>
              <span>TODAY</span>
              <h2>Your schedule</h2>
            </div>

            <b className="count-pill">
              {tasks.filter((task) => task.done).length}/{tasks.length}
            </b>
          </div>

          <div className="planner-list">
            {tasks.map((task) => (
              <div
                className={`planner-item ${task.done ? "done" : ""}`}
                key={task.id}
              >
                <time>{task.time}</time>

                <div className="planner-line" />

                <label>
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() =>
                      setTasks(
                        tasks.map((item) =>
                          item.id === task.id
                            ? { ...item, done: !item.done }
                            : item
                        )
                      )
                    }
                  />

                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.duration}</small>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setTasks(
                      tasks.filter((item) => item.id !== task.id)
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="app-card">
          <div className="card-head">
            <div>
              <span>NEW TASK</span>
              <h2>Add study block</h2>
            </div>
          </div>

          <input
            className="full-input"
            placeholder="What will you study?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <input
            className="full-input"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />

          <button
            type="button"
            className="primary-btn full-btn"
            onClick={add}
          >
            Add to planner
          </button>
        </section>
      </div>
    </Layout>
  );
}


/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function Progress() {
  const { mine } = useMyCourses();

  const [history] = useUserState("studyhubQuizHistory", []);
  const [tasks] = useUserState("studyhubPlanner", []);

  const quizAverage = history.length
    ? `${average(
        history.map((item) => percent(item.score, item.total))
      )}%`
    : "—";

  const courseAverage = average(
    mine.map((course) => course.progress)
  );

  const finished = mine.filter(
    (course) => course.progress === 100
  ).length;

  const insights = analyzePerformance(history, mine);

  return (
    <Layout title="Progress" subtitle="Measure your learning">
      <PageIntro
        eyebrow="PERFORMANCE"
        title="Your progress"
        text="An overview of your course completion and quiz performance."
      />

      <div className="stats-grid">
        <Stat
          icon="↗"
          label="Course progress"
          value={`${courseAverage}%`}
          note="Across all courses"
        />

        <Stat
          icon="◆"
          label="Quiz average"
          value={quizAverage}
          note={`${history.length} attempts`}
        />

        <Stat
          icon="✓"
          label="Courses finished"
          value={finished}
          note={`${mine.length - finished} in progress`}
        />

        <Stat
          icon="◷"
          label="Study blocks done"
          value={tasks.filter((task) => task.done).length}
          note={`${tasks.length} planned`}
        />
      </div>

      <section className="app-card insight-card">
        <div className="card-head">
          <div>
            <span>✦ AI ANALYSIS</span>
            <h2>Performance insights</h2>
          </div>
        </div>

        <ul className="insight-list">
          {insights.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>

      <div className="content-grid two">
        <section className="app-card">
          <div className="card-head">
            <div>
              <span>COURSES</span>
              <h2>Completion</h2>
            </div>
          </div>

          {mine.length ? (
            mine.map((course) => (
              <div className="progress-row" key={course.id}>
                <div>
                  <strong>{course.title}</strong>
                  <span>{course.progress}%</span>
                </div>

                <div className="bar">
                  <i
                    style={{
                      width: `${course.progress}%`,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon="↗"
              title="No courses yet"
              text="Enroll in a course to track your progress."
            />
          )}
        </section>

        <section className="app-card">
          <div className="card-head">
            <div>
              <span>QUIZ PERFORMANCE</span>
              <h2>Recent scores</h2>
            </div>
          </div>

          {history.length ? (
            history.slice(0, 6).map((attempt) => (
              <div className="history-row" key={attempt.id}>
                <span>◆</span>

                <div>
                  <strong>
                    {attempt.score}/{attempt.total} ·{" "}
                    {attempt.title}
                  </strong>

                  <small>{attempt.date}</small>
                </div>

                <b>
                  {percent(attempt.score, attempt.total)}%
                </b>
              </div>
            ))
          ) : (
            <EmptyState
              icon="↗"
              title="No quiz data yet"
              text="Take a quiz to start building your performance history."
            />
          )}
        </section>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Settings (used by every role)                                       */
/* ------------------------------------------------------------------ */



 