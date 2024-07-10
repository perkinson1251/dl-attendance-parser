import inquirer from 'inquirer';
import puppeteer from 'puppeteer';

async function loginAndScrape() {
  const credentials = await inquirer.prompt([{
      type: 'input',
      name: 'username',
      message: 'Enter your username (name.surname@nure.ua):',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your password:',
      mask: '*',
    },
  ]);

  const {
    username,
    password
  } = credentials;

  const browser = await puppeteer.launch({
    headless: true
  });
  const page = await browser.newPage();

  await page.goto('https://dl.nure.ua/login/index.php', {
    waitUntil: 'networkidle0'
  });

  await page.type('#username', username);
  await page.type('#password', password);

  await page.click('#loginbtn'),

    await page.goto('https://dl.nure.ua/my/courses.php', {
      waitUntil: 'networkidle0'
    });

  const data = await page.evaluate(() => {
    const courseElements = document.querySelectorAll('.card.dashboard-card[data-region="course-content"]');

    const courseData = Array.from(courseElements).map(course => {
      return {
        name: course.querySelector('span.multiline').textContent.trim().replace(/\s+/g, ' '),
        url: course.querySelector('a').href,
      };
    });
    return courseData;
  });

  if (!data || data.length === 0) {
    throw Error("No data provided!");
  }

  const choices = data.map(course => ({
    name: course.name,
    value: course.url,
  }));

  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'courseUrl',
    message: 'Select a course:',
    choices,
  }, ]);

  await page.goto(answers.courseUrl, {
    waitUntil: 'networkidle0'
  })

  const attendanceUrl = await page.evaluate(() => {
    const attendanceElement = document.querySelector('div[data-activityname="Відвідування"] a.aalink');
    return attendanceElement ? attendanceElement.href : null;
  });

  if (attendanceUrl) {
    await page.goto(attendanceUrl, {
      waitUntil: 'networkidle0'
    });
    console.log(`Navigated to: ${attendanceUrl}`);

    const isEmptyMonth = await page.evaluate(() => {
      const emptyTable = document.querySelector('tbody.empty');
      return !!emptyTable;
    });

    if (isEmptyMonth) {
      const {
        goToPreviousMonth
      } = await inquirer.prompt([{
        type: 'confirm',
        name: 'goToPreviousMonth',
        message: 'The current month has no attendance records. Go back a month?',
        default: false,
      }, ]);

      if (goToPreviousMonth) {
        const previousMonthUrl = await page.evaluate(() => {
          const dateControls = document.querySelector('.curdatecontrols');
          if (dateControls) {
            const previousLink = dateControls.querySelector('a');
            return previousLink ? previousLink.href : null;
          }
          return null;
        });

        if (previousMonthUrl) {
          await page.goto(previousMonthUrl, {
            waitUntil: 'networkidle0'
          });
          console.log(`Navigated to previous month: ${previousMonthUrl}`);

          const attendanceData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.generaltable.attwidth.boxaligncenter tbody tr'));

            return rows.map(row => {
              const columns = row.querySelectorAll('td');
              return {
                date: columns[0].textContent.trim(),
                description: columns[1].textContent.trim(),
                status: columns[2].textContent.trim(),
                points: columns[3].textContent.trim(),
                remark: columns[4].textContent.trim(),
              };
            });
          });

          console.log('Attendance Data:');
          console.log(attendanceData);
        } else {
          console.log('Previous month link not found');
        }
      } else {
        console.log('User chose not to go back a month');
      }
    } else {
      const attendanceData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.generaltable.attwidth.boxaligncenter tbody tr'));

        return rows.map(row => {
          const columns = row.querySelectorAll('td');
          return {
            date: columns[0].textContent.trim(),
            description: columns[1].textContent.trim(),
            status: columns[2].textContent.trim(),
            points: columns[3].textContent.trim(),
            remark: columns[4].textContent.trim(),
          };
        });
      });

      console.log('Attendance Data:');
      console.log(attendanceData);
    }
  } else {
    console.log('Attendance link not found');
  }

  await browser.close();
}

loginAndScrape().catch(error => console.error(error));