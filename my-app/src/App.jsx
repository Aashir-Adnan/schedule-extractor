import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const DAY_ORDER = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

const COLORS = {
  dark: {
    bg: "#1D2E28",
    card: "#14452F",
    accent: "#0A5C36",
    text: "#43e97b",
    subtext: "#43e97b",
    border: "#0A5C36",
    shadow: "rgba(10,92,54,0.15)",
    input: "#14452F",
    inputText: "#43e97b",
    button: "#0A5C36",
    buttonText: "#43e97b",
    buttonHover: "#14452F",
  },
  light: {
    bg: "#b7e4c7",
    card: "#e9f5ee",
    accent: "#0A5C36",
    text: "#0A5C36",
    subtext: "#0A5C36",
    border: "#0A5C36",
    shadow: "rgba(10,92,54,0.07)",
    input: "#fff",
    inputText: "#0A5C36",
    button: "#0A5C36",
    buttonText: "#ffff",
    buttonHover: "#14452F",
  },
};

function App() {
  // Persistent state helpers
  function getStored(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  }
  function setStored(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { }
  }

  // Persistent dark mode
  const [darkMode, setDarkMode] = useState(() => getStored("darkMode", true));
  useEffect(() => { setStored("darkMode", darkMode); }, [darkMode]);

  // Persistent form fields
  const [discipline, setDiscipline] = useState(() => getStored("discipline", ""));
  const [section, setSection] = useState(() => getStored("section", ""));
  const [additionalCourses, setAdditionalCourses] = useState(() => getStored("additionalCourses", [{ name: "", section: "" }]));

  useEffect(() => { setStored("discipline", discipline); }, [discipline]);
  useEffect(() => { setStored("section", section); }, [section]);
  useEffect(() => { setStored("additionalCourses", additionalCourses); }, [additionalCourses]);

  const [uniqueClasses, setUniqueClasses] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [activeBtn, setActiveBtn] = useState("");
  const [copied, setCopied] = useState(false);

  const scheduleRef = useRef();
  const fileInputRef = useRef();


  const animatedButtonStyle = {
    transition: "background 0.3s, color 0.3s, transform 0.1s",
    willChange: "transform",
  };
  const animatedButtonActive = {
    transform: "scale(0.96)",
  };


  const handleFile = async (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);
    setResult(null);
    setUniqueClasses([]);
    setSelectedClasses([]);
    setSection("");
    setDiscipline("");
    setAdditionalCourses([{ name: "", section: "" }]);
    setStep(2);
  };

  async function extractSchedule({ file, discipline, section, additionalCourses }) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });

    const sheetName = workbook.SheetNames.find(
      (n) => n.toLowerCase() === discipline.toLowerCase()
    );
    if (!sheetName) throw new Error("Sheet not found");

    const csSheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(csSheet["!ref"]);
    const byDay = {};

    const col = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = csSheet[XLSX.utils.encode_cell({ r: 1, c })];
      if (!cell) continue;
      const v = String(cell.v).toLowerCase().trim();
      if (v === "day 1") col.d1 = c;
      if (v === "slot 1") col.t1 = c;
      if (v === "venue 1") col.v1 = c;
      if (v === "day 2") col.d2 = c;
      if (v === "slot 2") col.t2 = c;
      if (v === "venue 2") col.v2 = c;
      if (v === "course short title") col.cst = c;
    }

    const add = (row, d, t, v, name, sectionVal) => {
      const dc = csSheet[XLSX.utils.encode_cell({ r: row, c: d })];
      const tc = csSheet[XLSX.utils.encode_cell({ r: row, c: t })];
      const vc = csSheet[XLSX.utils.encode_cell({ r: row, c: v })];
      if (!dc || !tc || !vc) return;

      const day = String(dc.v).toLowerCase().slice(0, 3);
      const start = String(tc.v).trim();
      const venue = String(vc.v).trim();
      if (!day || !start || !venue) return;

      const [h, m] = start.split(":").map(Number);
      const end = new Date(2000, 0, 1, h, m + 90)
        .toTimeString()
        .slice(0, 5);

      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({
        name,
        section: sectionVal,
        day,
        time: `${start}-${end}`,
        venue,
      });
    };

    for (let r = 4; r <= range.e.r; r++) {
      const nameCell = csSheet[XLSX.utils.encode_cell({ r, c: 1 })];
      const secCell = csSheet[XLSX.utils.encode_cell({ r, c: 2 })];
      const shortNameCell = csSheet[XLSX.utils.encode_cell({ r, c: 8})];
      if (!nameCell || !secCell) continue;

      const name = String(nameCell.v).trim();
      const sectionVal = String(secCell.v).trim();
      const shortName = String(shortNameCell?.v)?.trim() || "";

      const match =
        (section && sectionVal.toLowerCase().includes(section.toLowerCase())) ||
        additionalCourses?.some(
          (c) =>
           ( name.toLowerCase().includes(c.name.toLowerCase()) || shortName?.toLowerCase().includes(c.name.toLowerCase()) ) &&
            sectionVal.toLowerCase().includes(c.section.toLowerCase())
        );

      if (!match) continue;

      add(r, col.d1, col.t1, col.v1, name, sectionVal);
      add(r, col.d2, col.t2, col.v2, name, sectionVal);
    }

    return byDay;
  }

  const extractFoundClasses = async () => {
    try {
      const result = await extractSchedule({
        file,
        discipline,
        section,
        additionalCourses,
      });

      const classList = [
        ...new Set(Object.values(result).flat().map((c) => c.name)),
      ];

      setUniqueClasses(classList);
      setSelectedClasses(classList);
      setResult(result);
    } catch (e) {
      setError(e.message);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await extractSchedule({
      file,
      discipline,
      section,
      additionalCourses,
    });

    Object.keys(result).forEach(
      (d) => (result[d] = result[d].filter((c) => selectedClasses.includes(c.name)))
    );

    setResult(result);
    setLoading(false);
  };


  const handleClassToggle = (cls) => {
    setSelectedClasses((prev) =>
      prev.includes(cls)
        ? prev.filter((c) => c !== cls)
        : [...prev, cls]
    );
  };

  const handleAdditionalCourseChange = (idx, field, value) => {
    setAdditionalCourses((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c
      )
    );
  };
  const addAdditionalCourse = () => {
    setAdditionalCourses((prev) => [...prev, { name: "", section: "" }]);
  };
  const removeAdditionalCourse = (idx) => {
    setAdditionalCourses((prev) => prev.filter((_, i) => i !== idx));
  };


  useEffect(() => {
    if (uniqueClasses.length > 0) {
      setSelectedClasses(uniqueClasses);
    }

  }, [section, additionalCourses, uniqueClasses]);

  function formatTime24to12(timeStr) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return timeStr;
    let hour = h % 12 || 12;
    let ampm = h < 12 ? "AM" : "PM";
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  }


  // PDF download: always use desktop format (fixed width, scale content)
  const handleDownloadPDF = () => {
    if (!result) return;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 40;
    const leftMargin = 36;
    const lineHeight = 22;
    const titleFontSize = 20;
    const dayFontSize = 15;
    const textFontSize = 12;

    // Dark mode colors
    const bgColor = theme.bg;
    const cardColor = theme.card;
    const accentColor = theme.text;
    const textColor = theme.text;
    const subtextColor = theme.subtext;

    // Draw dark background
    pdf.setFillColor(bgColor);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    // Title
    pdf.setFontSize(titleFontSize);
    pdf.setTextColor(accentColor);
    pdf.text("Your Schedule", pageWidth / 2, y, { align: "center" });
    y += 30;

    getOrderedDays(result).forEach(([day, classes]) => {
      // Draw card background for each day
      const cardHeight = (classes.length ? classes.length : 1) * lineHeight + 36;
      pdf.setFillColor(cardColor);
      pdf.roundedRect(leftMargin - 10, y - 18, pageWidth - leftMargin * 2 + 20, cardHeight, 10, 10, "F");

      pdf.setFontSize(dayFontSize);
      pdf.setTextColor(accentColor);
      pdf.text(day.charAt(0).toUpperCase() + day.slice(1), leftMargin, y);

      y += lineHeight;

      if (!classes.length) {
        pdf.setFontSize(textFontSize);
        pdf.setTextColor(subtextColor);
        pdf.text("No classes", leftMargin + 20, y);
        y += lineHeight;
      } else {
        classes.forEach((cls) => {
          pdf.setFontSize(textFontSize);
          pdf.setTextColor(textColor);
          const [start, end] = cls.time.split("-");
          const line = `${cls.name} | ${formatTime24to12(start)} - ${formatTime24to12(end)} | ${cls.venue}`;
          // Wrap text if too long
          const split = pdf.splitTextToSize(line, pageWidth - leftMargin * 2 - 20);
          split.forEach((txt) => {
            pdf.text(txt, leftMargin + 20, y);
            y += lineHeight;
          });
        });
      }
      y += 16;
      // Add new page if near bottom
      if (y > pageHeight - 60) {
        pdf.addPage();
        pdf.setFillColor(bgColor);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");
        y = 40;
      }
    });

    pdf.save("schedule.pdf");
  };

  // Copy to clipboard (plain text)
  const handleCopy = () => {
    if (!result) return;
    let text = "Your Schedule\n";
    getOrderedDays(result).forEach(([day, classes]) => {
      text += `\n${day.charAt(0).toUpperCase() + day.slice(1)}:\n`;
      if (!classes.length) {
        text += "  No classes\n";
      } else {
        classes.forEach((cls) => {
          text += `  ${cls.name} | ${cls.time} | ${cls.venue}\n`;
        });
      }
    });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  function getOrderedDays(resultObj) {
    const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri"];

    const parseTime = (timeStr) => {
      // "14:30-16:00" -> 14:30
      const [start] = timeStr.split("-");
      const [h, m] = start.split(":").map(Number);
      return h * 60 + m; // total minutes
    };

    return DAY_ORDER.map((day) => {
      const classes = resultObj && resultObj[day] ? resultObj[day] : [];

      // sort by start time
      classes.sort((a, b) => parseTime(a.time) - parseTime(b.time));

      return [day, classes];
    });
  }


  const theme = darkMode ? COLORS.dark : COLORS.light;

  return (
    <>
      <div
        style={{
          minHeight: "100svh",
          minWidth: "100vw",
          background: theme.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Segoe UI, sans-serif",
          flexDirection: "column",
          transition: "background 0.3s",
          boxSizing: "border-box",
          padding: "0 0.5rem",
          overflowX: "hidden",
        }}
      >
        { }
        {error && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(0,0,0,0.45)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                background: theme.card,
                color: theme.text,
                borderRadius: "14px",
                padding: "2rem 2.5rem",
                boxShadow: "0 4px 32px rgba(0,0,0,0.25)",
                textAlign: "center",
                minWidth: "300px",
                maxWidth: "90vw",
              }}
            >
              <div style={{ marginBottom: "1.5rem", fontSize: "1.1rem" }}>{error}</div>
              <button
                onClick={() => setError("")}
                style={{
                  background: theme.button,
                  color: theme.buttonText,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 1.5rem",
                  fontWeight: "bold",
                  fontSize: "1rem",
                  cursor: "pointer",
                  letterSpacing: "0.5px",
                  ...animatedButtonStyle,
                  ...(activeBtn === "ok" ? animatedButtonActive : {}),
                }}
                onMouseDown={() => setActiveBtn("ok")}
                onMouseUp={() => setActiveBtn("")}
                onMouseLeave={() => setActiveBtn("")}
              >
                OK
              </button>
            </div>
          </div>
        )}
        <div
          style={{
            width: "100%",
            minHeight: "100svh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            background: theme.bg,
            padding: "0 0.5rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: theme.card,
              borderRadius: "16px",
              boxShadow: `0 8px 32px ${theme.shadow}`,
              padding: "2.5rem 2rem",
              width: "100%",
              maxWidth: "520px",
              margin: "2rem 0 1rem 0",
              color: theme.text,
              transition: "background 0.3s, color 0.3s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxSizing: "border-box",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "1.5rem", width: "100%" }}>
              <h2
                style={{
                  textAlign: "center",
                  color: theme.text,
                  marginBottom: 0,
                  fontWeight: 700,
                  fontSize: "2rem",
                  letterSpacing: "1px",
                  flex: 1,
                }}
              >
                Schedule Extractinator 3000!
              </h2>
              { }
              <div
                style={{
                  marginLeft: "1rem",
                  display: "flex",
                  alignItems: "center",
                  userSelect: "none",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={() => setDarkMode((d) => !d)}
                    style={{ display: "none" }}
                  />
                  <span
                    style={{
                      width: "48px",
                      height: "26px",
                      borderRadius: "13px",
                      background: darkMode ? "#0A5C36" : "#e9f5ee",
                      display: "inline-block",
                      position: "relative",
                      transition: "background 0.4s cubic-bezier(.4,0,.2,1)",
                      boxShadow: darkMode ? "0 0 8px #0A5C36" : "0 0 8px #b7e4c7",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "3px",
                        left: darkMode ? "24px" : "3px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: theme.text,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: darkMode ? "#0A5C36" : "#fff",
                        fontSize: "1.1rem",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
                        transition: "left 0.4s cubic-bezier(.4,0,.2,1), background 0.4s cubic-bezier(.4,0,.2,1)",
                      }}
                    >
                      {darkMode ? "🌙" : "☀️"}
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <form onSubmit={handleSubmit} style={{ width: "100%" }}>
              { }
              <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFile}
                  required
                  ref={fileInputRef}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  style={{
                    width: "100%",
                    padding: "0.7rem",
                    background: theme.text,
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    fontSize: "1rem",
                    cursor: "pointer",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.5px",
                    boxShadow: "0 2px 8px rgba(10,92,54,0.10)",
                    ...animatedButtonStyle,
                    ...(activeBtn === "file" ? animatedButtonActive : {}),
                  }}
                  onMouseDown={() => setActiveBtn("file")}
                  onMouseUp={() => setActiveBtn("")}
                  onMouseLeave={() => setActiveBtn("")}
                >
                  {file ? "File Selected ✔" : "Upload Timetable (.xlsx)"}
                </button>
                {file && (
                  <div style={{ color: theme.text, fontSize: "0.95rem", marginTop: "0.25rem" }}>
                    {file.name}
                  </div>
                )}
              </div>
              { }
              {step === 2 && (
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: theme.text,
                    width: "100%",
                  }}
                >
                  Discipline (sheet name, e.g. cs, ce)
                  <input
                    type="text"
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      margin: "0.25rem 0 1rem 0",
                      borderRadius: "6px",
                      border: `1px solid ${theme.border}`,
                      background: theme.input,
                      color: theme.text,
                      textAlign: "center",
                    }}
                    placeholder="e.g. cs, ce"
                  />
                </label>
              )}
              { }
              {step === 2 && (
                <div style={{ display: "flex", gap: "0.5rem", width: "100%", marginBottom: "1rem", flexWrap: "wrap" }}>
                  <label
                    style={{
                      flex: 1,
                      minWidth: "120px",
                      color: theme.text,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    Section
                    <input
                      type="text"
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        margin: "0.25rem 0 0 0",
                        borderRadius: "6px",
                        border: `1px solid ${theme.border}`,
                        background: theme.input,
                        color: theme.text,
                        textAlign: "center",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                      placeholder="e.g. A, AB, XYZ"
                    />
                  </label>
                  <div style={{ flex: 2, minWidth: "180px" }}>
                    <strong style={{ color: theme.text, display: "block", textAlign: "center" }}>
                      Additional Courses
                    </strong>
                    {additionalCourses.map((course, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Course Name"
                          value={course.name}
                          onChange={(e) =>
                            handleAdditionalCourseChange(idx, "name", e.target.value)
                          }
                          style={{
                            flex: 2,
                            minWidth: "90px",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            border: `1px solid ${theme.border}`,
                            background: theme.input,
                            color: theme.text,
                            textAlign: "center",
                            boxSizing: "border-box",
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Section"
                          value={course.section}
                          onChange={(e) =>
                            handleAdditionalCourseChange(idx, "section", e.target.value)
                          }
                          style={{
                            flex: 1,
                            minWidth: "60px",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            border: `1px solid ${theme.border}`,
                            background: theme.input,
                            color: theme.text,
                            textAlign: "center",
                            boxSizing: "border-box",
                          }}
                        />
                        {additionalCourses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAdditionalCourse(idx)}
                            style={{
                              background: "#f87171",
                              color: "#fff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "0.25rem 0.5rem",
                              cursor: "pointer",
                              ...animatedButtonStyle,
                              ...(activeBtn === `remove${idx}` ? animatedButtonActive : {}),
                            }}
                            onMouseDown={() => setActiveBtn(`remove${idx}`)}
                            onMouseUp={() => setActiveBtn("")}
                            onMouseLeave={() => setActiveBtn("")}
                            title="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addAdditionalCourse}
                      style={{
                        background: theme.button,
                        color: theme.buttonText,
                        border: "none",
                        borderRadius: "6px",
                        padding: "0.25rem 0.75rem",
                        fontSize: "0.95rem",
                        cursor: "pointer",
                        marginTop: "0.25rem",
                        ...animatedButtonStyle,
                        ...(activeBtn === "addCourse" ? animatedButtonActive : {}),
                      }}
                      onMouseDown={() => setActiveBtn("addCourse")}
                      onMouseUp={() => setActiveBtn("")}
                      onMouseLeave={() => setActiveBtn("")}
                    >
                      + Add Course
                    </button>
                  </div>
                </div>
              )}
              { }
              {step === 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      extractFoundClasses();
                      setStep(3);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: theme.button,
                      color: darkMode ? "#43e97b" : "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      fontSize: "1rem",
                      cursor: "pointer",
                      marginTop: "0.5rem",
                      transition: "background 0.3s, color 0.3s",
                      ...animatedButtonStyle,
                      ...(activeBtn === "next" ? animatedButtonActive : {}),
                    }}
                    onMouseDown={() => setActiveBtn("next")}
                    onMouseUp={() => setActiveBtn("")}
                    onMouseLeave={() => setActiveBtn("")}
                    disabled={!section || !discipline}
                  >
                    Next: Select Classes
                  </button>
                </>
              )}
              { }
              {step === 3 && (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <strong style={{ color: theme.text }}>
                      Classes Found (click to select/deselect):
                    </strong>
                    <div
                      style={{
                        maxHeight: "120px",
                        overflowY: "auto",
                        border: `1px solid ${theme.border}`,
                        borderRadius: "6px",
                        padding: "0.5rem",
                        marginTop: "0.5rem",
                        background: theme.input,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      {uniqueClasses.map((cls) => {
                        const selected = selectedClasses.includes(cls);
                        return (
                          <div
                            key={cls}
                            onClick={() => handleClassToggle(cls)}
                            style={{
                              cursor: "pointer",
                              userSelect: "none",
                              padding: "0.5rem 1rem",
                              borderRadius: "8px",
                              background: selected ? "#43e97b" : "#f87171",
                              color: selected ? "#fff" : "#fff",
                              fontWeight: "bold",
                              border: selected
                                ? `2px solid #43e97b`
                                : `2px solid #f87171`,
                              boxShadow: selected
                                ? "0 2px 8px rgba(67,233,123,0.15)"
                                : "0 2px 8px rgba(248,113,113,0.15)",
                              transition: "background 0.2s, border 0.2s, color 0.2s, box-shadow 0.2s",
                              marginBottom: "0.25rem",
                              minWidth: "80px",
                              textAlign: "center",
                              outline: selected ? "2px solid #43e97b" : "2px solid #f87171",
                            }}
                            tabIndex={0}
                            onKeyDown={e => {
                              if (e.key === " " || e.key === "Enter") handleClassToggle(cls);
                            }}
                            aria-pressed={selected}
                          >
                            {cls}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      style={{
                        flex: 1,
                        padding: "0.5rem",
                        background: theme.input,
                        color: theme.text,
                        border: `1px solid ${theme.text}`,
                        borderRadius: "6px",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      Edit Section/Courses
                    </button>
                    <button
                      type="submit"
                      style={{
                        flex: 1,
                        padding: "0.5rem",
                        background: theme.button,
                        color: darkMode ? "#43e97b" : "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        ...animatedButtonStyle,
                        ...(activeBtn === "extract" ? animatedButtonActive : {}),
                      }}
                      onMouseDown={() => setActiveBtn("extract")}
                      onMouseUp={() => setActiveBtn("")}
                      onMouseLeave={() => setActiveBtn("")}
                      disabled={loading}
                    >
                      {loading ? "Extracting..." : "Extract Schedule"}
                    </button>
                  </div>
                </>
              )}
            </form>
            { }
            {result && (
              <div style={{ marginTop: "2rem", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    style={{
                      background: theme.button,
                      color: theme.buttonText,
                      border: "none",
                      borderRadius: "6px",
                      padding: "0.5rem 1.2rem",
                      fontWeight: "bold",
                      fontSize: "1rem",
                      cursor: "pointer",
                      boxShadow: `0 2px 8px ${theme.shadow}`,
                      transition: "background 0.3s, color 0.3s",
                      ...animatedButtonStyle,
                      ...(activeBtn === "download" ? animatedButtonActive : {}),
                    }}
                    onMouseDown={() => setActiveBtn("download")}
                    onMouseUp={() => setActiveBtn("")}
                    onMouseLeave={() => setActiveBtn("")}
                  >
                    Download as PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    style={{
                      background: theme.button,
                      color: theme.buttonText,
                      border: "none",
                      borderRadius: "6px",
                      padding: "0.5rem 1.2rem",
                      fontWeight: "bold",
                      fontSize: "1rem",
                      cursor: "pointer",
                      boxShadow: `0 2px 8px ${theme.shadow}`,
                      transition: "background 0.3s, color 0.3s",
                      ...animatedButtonStyle,
                      ...(activeBtn === "copy" ? animatedButtonActive : {}),
                    }}
                    onMouseDown={() => setActiveBtn("copy")}
                    onMouseUp={() => setActiveBtn("")}
                    onMouseLeave={() => setActiveBtn("")}
                  >
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </button>
                </div>
                <div
                  ref={scheduleRef}
                  style={{
                    background: theme.bg,
                    borderRadius: "14px",
                    padding: "2rem 1.5rem",
                    boxShadow: `0 2px 12px ${theme.shadow}`,
                    color: theme.text,
                    maxWidth: 480,
                    margin: "0 auto",
                    border: `2px solid ${theme.text}`,
                    boxSizing: "border-box",
                    minWidth: 0,
                    wordBreak: "break-word",
                  }}
                >
                  <h3
                    style={{
                      color: theme.text,
                      marginBottom: "1.5rem",
                      textAlign: "center",
                      letterSpacing: "1px",
                      fontWeight: 700,
                      fontSize: "1.3rem",
                    }}
                  >
                    Your Schedule
                  </h3>
                  {getOrderedDays(result).map(([day, classes]) => (
                    <div
                      key={day}
                      style={{
                        marginBottom: "1.5rem",
                        background: theme.card,
                        borderRadius: "10px",
                        padding: "1rem",
                        boxShadow: `0 2px 8px ${theme.shadow}`,
                      }}
                    >
                      <div style={{ fontWeight: "bold", color: theme.text, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </div>
                      {classes.length === 0 ? (
                        <span style={{ color: theme.subtext }}>No classes</span>
                      ) : (
                        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                          {classes.map((cls, idx) => {
                            const [start, end] = cls.time.split("-");
                            return (
                              <li
                                key={idx}
                                style={{
                                  marginBottom: "0.75rem",
                                  background: theme.input,
                                  borderRadius: "8px",
                                  padding: "0.75rem 1rem",
                                  boxShadow: `0 1px 4px ${theme.shadow}`,
                                  display: "flex",
                                  flexDirection: "column",
                                  color: theme.text,
                                }}
                              >
                                <span style={{ fontWeight: "bold", fontSize: "1.05rem", color: theme.text }}>
                                  {cls.name}
                                </span>
                                <div style={{ marginTop: "0.25rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                                  <span style={{ color: theme.text, fontWeight: 500 }}>
                                    <span style={{ fontWeight: 400, color: theme.subtext }}>Time:</span>{" "}
                                    {formatTime24to12(start)} - {formatTime24to12(end)}
                                  </span>
                                  <span style={{ color: "#43e97b", fontWeight: 500 }}>
                                    <span style={{ fontWeight: 400, color: theme.subtext }}>Venue:</span>{" "}
                                    {cls.venue}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          { }
<footer
  style={{
    marginTop: "2rem",
    textAlign: "center",
    color: darkMode ? "#b7e4c7" : "#14452F",
    fontSize: "0.9rem",
    letterSpacing: "0.5px",
    background: "transparent",
    width: "50%",
    display: "flex",
    justifyContent: "center",
    gap: "1rem",
    flexWrap: "wrap", // allow boxes to wrap on small screens
  }}
>
  {[
    {
      title: "Instagram",
      link: "https://www.instagram.com/ihavethisthingwithsatire/",
      username: "ihavethisthingwithsatire",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/instagram.svg",
    },
    {
      title: "GitHub",
      link: "https://github.com/Aashir-Adnan",
      username: "Aashir-Adnan",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg",
    },
    {
      title: "LinkedIn",
      link: "https://www.linkedin.com/in/aashir-adnan-69521b253/",
      username: "Aashir Adnan",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg",
    },
  ].map((social) => (
    <div
      key={social.title}
      style={{
        background: darkMode ? "#14452F" : "#e9f5ee",
        padding: "1rem",
        borderRadius: "10px",
        boxShadow: `0 2px 8px ${theme.shadow}`,
        flex: "1 1 150px", // allow shrinking and wrapping
        minWidth: "150px",
        textAlign: "center",
        marginBottom: "0.5rem",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.25rem" }}>
        {social.title}
      </div>
      <a
        href={social.link}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none", color: theme.text }}
      >
        <img
          src={social.icon}
          alt={social.title}
          style={{ width: 30, height: 30, fill: theme.text }}
        />
        <div style={{ marginTop: "0.25rem", fontWeight: 500 }}>{social.username}</div>
      </a>
    </div>
  ))}
</footer>

        </div>
      </div>
    </>
  );
}

export default App;

// Responsive style injection (at the bottom of your file, outside the component)
const style = document.createElement("style");
style.innerHTML = `
  html, body, #root {
    height: 100svh !important;
    min-height: 100svh !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important;
    background: transparent !important;
  }
  @media (max-width: 600px) {
    .AppContainer, .ScheduleCard {
      padding: 1.2rem 0.5rem !important;
      margin: 1rem 0 !important;
      max-width: 98vw !important;
      min-width: 0 !important;
    }
    .ScheduleCard h2, .ScheduleCard h3 {
      font-size: 1.1rem !important;
    }
    .ScheduleCard {
      font-size: 0.98rem !important;
    }
    .ScheduleCard input, .ScheduleCard button {
      font-size: 1rem !important;
    }
  }
`;
if (!document.head.querySelector("#responsive-style")) {
  style.id = "responsive-style";
  document.head.appendChild(style);
}

