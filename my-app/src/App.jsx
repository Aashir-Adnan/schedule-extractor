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
    buttonText: "#0A5C36",
    buttonHover: "#14452F",
  },
};

function App() {
  const [discipline, setDiscipline] = useState("");
  const [section, setSection] = useState("");
  const [additionalCourses, setAdditionalCourses] = useState([
    { name: "", section: "" },
  ]);
  const [uniqueClasses, setUniqueClasses] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1);
  const [darkMode, setDarkMode] = useState(true);
  const [error, setError] = useState(""); // For popup error
  const [activeBtn, setActiveBtn] = useState(""); // for animating buttons
  const scheduleRef = useRef();
  const fileInputRef = useRef();

  // Add this style object for button animation
  const animatedButtonStyle = {
    transition: "background 0.3s, color 0.3s, transform 0.1s",
    willChange: "transform",
  };
  const animatedButtonActive = {
    transform: "scale(0.96)",
  };

  // Extract unique classes after file upload
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

  const extractFoundClasses = () => {
    if (!file || !discipline) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target.result;
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames.find(
        (name) => name.toLowerCase() === discipline.toLowerCase()
      );
      if (!sheetName) {
        setError(`Sheet '${discipline}' not found.`);
        return;
      }
      const csSheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(csSheet["!ref"]);
      const foundClasses = [];

      for (let row = 4; row <= range.e.r; row++) {
        const courseNameCell = csSheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
        const sectionCell = csSheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
        if (!courseNameCell || !sectionCell) continue;

        const courseName = String(courseNameCell.v).trim();
        const courseSection = String(sectionCell.v).trim();

        const isSectionMatch =
          section &&
          courseSection.toLowerCase().includes(section.toLowerCase());
        const isAdditionalMatch =
          Array.isArray(additionalCourses) &&
          additionalCourses.some(
            (course) =>
              course.name &&
              course.section &&
              courseName.toLowerCase().includes(course.name.toLowerCase()) &&
              courseSection.toLowerCase().includes(course.section.toLowerCase())
          );

        if (isSectionMatch || isAdditionalMatch) {
          const day1Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 13 })];
          const time1Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 14 })];
          const venue1Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 15 })];

          const day2Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 16 })];
          const time2Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 17 })];
          const venue2Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 18 })];

          const addClassEntry = (dayCell, timeCell, venueCell) => {
            if (!dayCell || !timeCell || !venueCell) return;
            const day = String(dayCell.v).trim();
            const startTime = String(timeCell.v).trim();
            const venue = String(venueCell.v).trim();
            if (!day || !startTime || !venue) return;

            const [h, m] = startTime.split(":").map(Number);
            const startDate = new Date(2000, 0, 1, h, m);
            const endDate = new Date(startDate.getTime() + 90 * 60000);
            const endTime = endDate
              .toTimeString()
              .slice(0, 5);

            foundClasses.push({
              name: courseName,
              section: courseSection,
              day,
              time: `${startTime}-${endTime}`,
              venue,
            });
          };

          addClassEntry(day1Cell, time1Cell, venue1Cell);
          if (day2Cell && String(day2Cell.v).trim()) {
            addClassEntry(day2Cell, time2Cell, venue2Cell);
          }
        }
      }

      const classList = Array.from(
        new Set(foundClasses.map((c) => c.name))
      );
      setUniqueClasses(classList);
      setSelectedClasses(classList);
      setResult({ allClasses: foundClasses });
    };
    reader.readAsArrayBuffer(file);
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
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !discipline) {
      setError("Please upload your Timetable.xlsx file and select your discipline.");
      return;
    }
    setLoading(true);
    setResult(null);

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === discipline.toLowerCase()
    );
    if (!sheetName) {
      setError(`Sheet '${discipline}' not found.`);
      setLoading(false);
      return;
    }
    const csSheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(csSheet["!ref"]);
    const foundClasses = [];

    for (let row = 4; row <= range.e.r; row++) {
      const courseNameCell = csSheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
      const sectionCell = csSheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
      if (!courseNameCell || !sectionCell) continue;

      const courseName = String(courseNameCell.v).trim();
      const courseSection = String(sectionCell.v).trim();

      const isSectionMatch =
        section &&
        courseSection.toLowerCase().includes(section.toLowerCase());
      const isAdditionalMatch =
        Array.isArray(additionalCourses) &&
        additionalCourses.some(
          (course) =>
            course.name &&
            course.section &&
            courseName.toLowerCase().includes(course.name.toLowerCase()) &&
            courseSection.toLowerCase().includes(course.section.toLowerCase())
        );

      if (isSectionMatch || isAdditionalMatch) {
        const day1Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 13 })];
        const time1Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 14 })];
        const venue1Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 15 })];

        const day2Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 16 })];
        const time2Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 17 })];
        const venue2Cell = csSheet[XLSX.utils.encode_cell({ r: row, c: 18 })];

        const addClassEntry = (dayCell, timeCell, venueCell) => {
          if (!dayCell || !timeCell || !venueCell) return;
          const day = String(dayCell.v).trim();
          const startTime = String(timeCell.v).trim();
          const venue = String(venueCell.v).trim();
          if (!day || !startTime || !venue) return;

          const [h, m] = startTime.split(":").map(Number);
          const startDate = new Date(2000, 0, 1, h, m);
          const endDate = new Date(startDate.getTime() + 90 * 60000);
          const endTime = endDate
            .toTimeString()
            .slice(0, 5);

          foundClasses.push({
            name: courseName,
            section: courseSection,
            day,
            time: `${startTime}-${endTime}`,
            venue,
          });
        };

        addClassEntry(day1Cell, time1Cell, venue1Cell);
        if (day2Cell && String(day2Cell.v).trim()) {
          addClassEntry(day2Cell, time2Cell, venue2Cell);
        }
      }
    }

    // Group by day for display
    const resultObj = {};
    for (const entry of foundClasses) {
      if (!selectedClasses.includes(entry.name)) continue;
      const dayKey = entry.day.toLowerCase();
      if (!resultObj[dayKey]) resultObj[dayKey] = [];
      resultObj[dayKey].push(entry);
    }

    setResult(resultObj);
    setLoading(false);
  };

  useEffect(() => {
    if (uniqueClasses.length > 0) {
      setSelectedClasses(uniqueClasses);
    }
    // eslint-disable-next-line
  }, [section, additionalCourses, uniqueClasses]);

  function formatTime24to12(timeStr) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return timeStr;
    let hour = h % 12 || 12;
    let ampm = h < 12 ? "AM" : "PM";
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  // Download as PDF only
  const handleDownloadPDF = async () => {
    if (!scheduleRef.current) return;
    const canvas = await html2canvas(scheduleRef.current, {
      backgroundColor: darkMode ? COLORS.dark.bg : COLORS.light.bg,
      scale: 2,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: "a4",
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgProps = {
      width: canvas.width,
      height: canvas.height,
    };
    const ratio = Math.min(pageWidth / imgProps.width, pageHeight / imgProps.height);
    const imgWidth = imgProps.width * ratio;
    const imgHeight = imgProps.height * ratio;
    pdf.addImage(imgData, "PNG", (pageWidth - imgWidth) / 2, 20, imgWidth, imgHeight);
    pdf.save("schedule.pdf");
  };

  function getOrderedDays(resultObj) {
    // Always return all days, even if empty, to show "No classes"
    console.log(resultObj)
    return DAY_ORDER.map((d) => [d, resultObj && resultObj[d] ? resultObj[d] : []]);
  }

  const theme = darkMode ? COLORS.dark : COLORS.light;

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: theme.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Segoe UI, sans-serif",
        flexDirection: "column",
        transition: "background 0.3s",
        boxSizing: "border-box",
      }}
    >
      {/* Error Popup */}
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
          minHeight: "100vh",
          minWidth: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: theme.bg,
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "1.5rem", width: "100%" }}>
            <h2
              style={{
                textAlign: "center",
                color: darkMode ? "#43e97b" : "#0A5C36",
                marginBottom: 0,
                fontWeight: 700,
                fontSize: "2rem",
                letterSpacing: "1px",
                flex: 1,
              }}
            >
              Schedule Extractinator 3000!
            </h2>
            {/* Toggle Switch */}
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
                      background: darkMode ? "#43e97b" : "#0A5C36",
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
            {/* Step 1: Upload */}
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
                  background: darkMode ? "#43e97b" : "#0A5C36",
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
                <div style={{ color: darkMode ? "#43e97b" : "#0A5C36", fontSize: "0.95rem", marginTop: "0.25rem" }}>
                  {file.name}
                </div>
              )}
            </div>
            {/* Step 1.5: Discipline input */}
            {step === 2 && (
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  color: darkMode ? "#43e97b" : "#0A5C36",
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
                    color: darkMode ? "#43e97b" : "#0A5C36",
                    textAlign: "center",
                  }}
                  placeholder="e.g. cs, ce"
                />
              </label>
            )}
            {/* Step 2: Section and Additional Courses */}
            {step === 2 && (
              <>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: darkMode ? "#43e97b" : "#0A5C36",
                    width: "100%",
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
                      margin: "0.25rem 0 1rem 0",
                      borderRadius: "6px",
                      border: `1px solid ${theme.border}`,
                      background: theme.input,
                      color: darkMode ? "#43e97b" : "#0A5C36",
                      textAlign: "center",
                    }}
                    placeholder="e.g. 1A, 2B, 3C"
                  />
                </label>
                <div style={{ marginBottom: "1rem" }}>
                  <strong style={{ color: theme.accent }}>
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
                          padding: "0.5rem",
                          borderRadius: "6px",
                          border: `1px solid ${theme.border}`,
                          background: theme.input,
                          color: darkMode ? "#43e97b" : "#0A5C36",
                          textAlign: "center",
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
                          padding: "0.5rem",
                          borderRadius: "6px",
                          border: `1px solid ${theme.border}`,
                          background: theme.input,
                          color: darkMode ? "#43e97b" : "#0A5C36",
                          textAlign: "center",
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
                          }}
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
                    color: theme.buttonText,
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
            {/* Step 3: Checklist */}
            {step === 3 && (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  <strong style={{ color: theme.accent }}>
                    Classes Found (uncheck to exclude):
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
                      color: darkMode ? "#43e97b" : "#0A5C36",
                    }}
                  >
                    {uniqueClasses.map((cls) => (
                      <label
                        key={cls}
                        style={{
                          display: "block",
                          marginBottom: "0.25rem",
                          color: darkMode ? "#43e97b" : "#0A5C36",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(cls)}
                          onChange={() => handleClassToggle(cls)}
                          style={{ marginRight: "0.5rem" }}
                        />
                        {cls}
                      </label>
                    ))}
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
                      color: theme.accent,
                      border: `1px solid ${theme.accent}`,
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
          {/* Show result */}
          {result && Object.keys(result).length > 0 && (
            <div style={{ marginTop: "2rem", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  style={{
                    background: theme.button,
                    color: darkMode ? "#43e97b" : "#fff",
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
              </div>
              <div
                ref={scheduleRef}
                style={{
                  background: theme.bg,
                  borderRadius: "14px",
                  padding: "2rem 1.5rem",
                  boxShadow: `0 2px 12px ${theme.shadow}`,
                  color: "#fff",
                  maxWidth: 480,
                  margin: "0 auto",
                  border: `2px solid ${theme.accent}`,
                }}
              >
                <h3
                  style={{
                    color: darkMode ? "#fff" : "#0A5C36",
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
                    <div style={{ fontWeight: "bold", color: darkMode ? "#fff" : "#0A5C36" , fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </div>
                    {classes.length === 0 ? (
                      <span style={{ color: darkMode ? "#43e97b" : "#0A5C36"}}>No classes</span>
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
                                color: darkMode ? "#43e97b" : "#0A5C36"
                              }}
                            >
                              <span style={{ fontWeight: "bold", fontSize: "1.05rem", color: darkMode ? "#fff" : "#0A5C36" }}>
                                {cls.name}
                              </span>
                              <div style={{ marginTop: "0.25rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                                <span style={{ color: darkMode ? "#fff" : "#0A5C36", fontWeight: 500 }}>
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
        {/* About Dev Section */}
        <footer
          style={{
            marginTop: "2rem",
            textAlign: "center",
            color: darkMode ? "#b7e4c7" : "#14452F",
            fontSize: "0.9rem",
            letterSpacing: "0.5px",
            background: "transparent",
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: darkMode ? "#14452F" : "#e9f5ee",
              display: "inline-block",
              padding: "0.5rem 1.2rem",
              borderRadius: "10px",
              boxShadow: `0 2px 8px ${theme.shadow}`,
              fontSize: "0.95rem",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.15rem" }}>
              About the Developer
            </div>
            <div>
              <span style={{ fontWeight: 500 }}>Aashir Adnan</span>
              <br />
              <a
                href="mailto:l226753@lhr.nu.edu.pk"
                style={{
                  color: darkMode ? "#43e97b" : "#0A5C36",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                l226753@lhr.nu.edu.pk
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;