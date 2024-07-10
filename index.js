import inquirer from "inquirer";
import puppeteer from "puppeteer";

async function loginAndScrape() {
  const credentials = await inquirer.prompt([
    {
      type: "input",
      name: "username",
      message: "Enter your username (name.surname@nure.ua):",
    },
    {
      type: "password",
      name: "password",
      message: "Enter your password:",
      mask: "*",
    },
  ]);

  const { username, password } = credentials;

  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();

  await page.goto("https://dl.nure.ua/login/index.php", {
    waitUntil: "networkidle0",
  });

  await page.type("#username", username);
  await page.type("#password", password);

  await Promise.all([
    page.click("#loginbtn"),
    page.waitForNavigation({ waitUntil: "networkidle0" }),
  ]);

  await page.goto("https://dl.nure.ua/my/courses.php", {
    waitUntil: "networkidle0",
  });

  const data = await page.evaluate(() => {
    const courseElements = document.querySelectorAll(
      '.card.dashboard-card[data-region="course-content"]'
    );

    const courseData = Array.from(courseElements).map((course) => {
      return {
        name: course
          .querySelector("span.multiline")
          .textContent.trim()
          .replace(/\s+/g, " "),
        url: course.querySelector("a").href,
      };
    });
    return courseData;
  });

  if (!data || data.length === 0) {
    throw Error("No courses found!");
  }

  const choices = data.map((course) => ({
    name: course.name,
    value: course.url,
  }));

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "courseUrl",
      message: "Select a course:",
      choices,
    },
  ]);

  await page.goto(answers.courseUrl, {
    waitUntil: "networkidle0",
  });

  let attendanceUrl = await page.evaluate(() => {
    const attendanceElement = document.querySelector(
      'div[data-activityname="Відвідування"] a.aalink'
    );
    return attendanceElement ? attendanceElement.href : null;
  });

  if (!attendanceUrl) {
    throw Error("Attendance link not found!");
  }

  while (true) {
    await page.goto(attendanceUrl, { waitUntil: "networkidle0" });
    console.log(`Navigated to: ${attendanceUrl}`);

    const isEmptyMonth = await page.evaluate(() => {
      const emptyTable = document.querySelector("tbody.empty");
      return !!emptyTable;
    });

    if (isEmptyMonth) {
      const { goBackOrForward } = await inquirer.prompt({
        type: "list",
        name: "goBackOrForward",
        message:
          "The current month has no attendance records. What do you want to do?",
        choices: [
          { name: "Go back a month", value: "back" },
          { name: "Go forward a month", value: "forward" },
          { name: "Cancel", value: "cancel" },
        ],
      });

      const dateControls = await page.evaluate(() => {
        const controls = document.querySelector(".curdatecontrols");
        if (!controls) return null;

        const previousLink = controls.querySelector("a:first-of-type");
        const nextLink = controls.querySelector("a:last-of-type");
        const currentMonth = controls
          .querySelector("#currentdate button")
          .textContent.trim();

        return {
          previousMonthUrl: previousLink ? previousLink.href : null,
          nextMonthUrl: nextLink ? nextLink.href : null,
          currentMonth,
        };
      });

      if (!dateControls) {
        console.log("Date controls not found");
        break;
      }

      if (
        (goBackOrForward === "back" && dateControls.previousMonthUrl) ||
        (goBackOrForward === "forward" && dateControls.nextMonthUrl)
      ) {
        attendanceUrl =
          goBackOrForward === "back"
            ? dateControls.previousMonthUrl
            : dateControls.nextMonthUrl;
        console.log(
          `Navigated to ${
            goBackOrForward === "back" ? "previous" : "next"
          } month: ${attendanceUrl}`
        );
      } else {
        console.log(
          `No ${
            goBackOrForward === "back" ? "previous" : "next"
          } month link found`
        );
        break;
      }
    } else {
      const attendanceData = await page.evaluate(() => {
        const rows = Array.from(
          document.querySelectorAll(
            ".generaltable.attwidth.boxaligncenter tbody tr"
          )
        );

        return rows.map((row) => ({
          date: row.querySelectorAll("td")[0].textContent.trim(),
          description: row.querySelectorAll("td")[1].textContent.trim(),
          status: row.querySelectorAll("td")[2].textContent.trim(),
          points: row.querySelectorAll("td")[3].textContent.trim(),
          remark: row.querySelectorAll("td")[4].textContent.trim(),
        }));
      });

      console.log("Attendance Data:");
      console.log(attendanceData);
      break;
    }
  }

  await browser.close();
}

loginAndScrape().catch((error) => console.error(error));
