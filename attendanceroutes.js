const express = require('express');
const router = express.Router();
const Attendance = require("../models/attendances");
const Student = require('../models/student');
const Teacher = require('../models/teacher');
const Subject = require('../models/subject');
const Class = require('../models/class');
const  axios = require('axios');
const authMiddleware = require('../middleware/authmiddleware');







/**********************************************************************************************************************************************************************************
 *  Qr link generation
*********************************************************************************************************************************************************************************** */

// Endpoint for generation of QR code from teacher
router.post('/takeAttendance', authMiddleware(['Admin','Teacher']), async (req, res) => {
    try {
        // Extract class details from the request body
        // Still need to request USerID
        const { section, batch, branch, subjectCode } = req.body;
        console.log(section, batch, branch, subjectCode)
        let userID = req.userID;
        console.log(userID)
        const requestData = { section, batch, branch, subjectCode, userID };

        // Get the token from the request headers
        const token = req.headers.authorization;

        // Include the token in the request headers
        const qrCodeServiceResponse = await axios.post('http://localhost:5004/generateQRCode', requestData, {
            headers: {
                Authorization: token
            }
        });

        if (qrCodeServiceResponse.status !== 200) {
            throw new Error('Failed to generate QR code');
        }

        const qrCodeImageData = qrCodeServiceResponse.data.qrCodeImage;
        res.send({ qrCodeImage: qrCodeImageData });
    } catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).send('Internal Server Error');
    }
});












/**********************************************************************************************************************************************************************************
 *  Marking Attendances
*********************************************************************************************************************************************************************************** */

// Endpoint for marking the attendance of the student
router.post('/markattendance', authMiddleware(['student','Teacher']) , async (req, res) => {
    const { section, batch, course, branch, userID, subjectCode, studentID } = req.body;
    try {
        const classDetails = await Class.findOne({
            class_section: section,
            class_batch: batch,
            class_branch: branch,
        });

        if (!classDetails) {
            return res.status(404).json({ error: 'Class details not found' });
        }

        let attendance = await Attendance.findOne({
            batch: batch
        });

        const subject = await Subject.findOne({ subject_code: subjectCode });
        if (!subject) {
            return res.status(404).json({ error: 'Subject details not found' });
        }

        const matchingSubject = classDetails.subject.find(sub => sub.subject_name.equals(subject._id));
        if (!matchingSubject) {
            return res.status(404).json({ error: 'Subject not found in class details' });
        }

        const subjectTeacherId = matchingSubject.subject_teacher;
        const teacher = await Teacher.findById(userID);
        if (!teacher) {
            return res.status(404).json({ error: 'Teacher details not found' });
        }

        const student = await Student.findById(studentID);
        if (!student) {
            return res.status(404).json({ error: 'Student details not found' });
        }

        const attendanceRecord = {
            teacher: teacher._id,
            date: new Date(),
            status: 'present'
        };

        if (!attendance) {
            // Create new attendance document
            attendance = new Attendance({
                batch,
                years: [{
                    course,
                    department: [{
                        branch,
                        classes: [{
                            section,
                            subject: [{
                                subject_name: subject._id,
                                subject_code: subjectCode,
                                class_id: classDetails._id,
                                subject_teacher: subjectTeacherId,
                                students: [{
                                    student_id: studentID,
                                    student_name: student.student_name,
                                    attendance: [attendanceRecord]
                                }]
                            }]
                        }]
                    }]
                }]
            });
        } else {
            let yearIndex = -1;
            let departmentIndex = -1;
            let classIndex = -1;
            let subjectIndex = -1;

            // Check if year exists
            yearIndex = attendance.years.findIndex(year => year.course === course);
            if (yearIndex === -1) {
                // Create new year
                attendance.years.push({ course });
                yearIndex = attendance.years.length - 1;
            }

            // Check if department exists
            departmentIndex = attendance.years[yearIndex].department.findIndex(dept => dept.branch === branch);
            if (departmentIndex === -1) {
                // Create new department
                attendance.years[yearIndex].department.push({ branch });
                departmentIndex = attendance.years[yearIndex].department.length - 1;
            }

            // Check if class exists
            classIndex = attendance.years[yearIndex].department[departmentIndex].classes.findIndex(cls => cls.section === section);
            if (classIndex === -1) {
                // Create new class
                attendance.years[yearIndex].department[departmentIndex].classes.push({ section });
                classIndex = attendance.years[yearIndex].department[departmentIndex].classes.length - 1;
            }

            // Check if subject exists
            subjectIndex = attendance.years[yearIndex].department[departmentIndex].classes[classIndex].subject.findIndex(sub => sub.subject_name.equals(subject._id));
            if (subjectIndex === -1) {
                // Create new subject
                attendance.years[yearIndex].department[departmentIndex].classes[classIndex].subject.push({
                    subject_name: subject._id,
                    subject_code: subjectCode,
                    class_id: classDetails._id,
                    subject_teacher: subjectTeacherId,
                    students: [{
                        student_id: studentID,
                        student_name: student.student_name,
                        attendance: [attendanceRecord]
                    }]
                });
            } else {
                // Update existing subject
                const existingSubject = attendance.years[yearIndex].department[departmentIndex].classes[classIndex].subject[subjectIndex];
                const studentExists = existingSubject.students.some(stud => stud.student_id.toString() === studentID);
                if (!studentExists) {
                    // Add new student
                    existingSubject.students.push({
                        student_id: studentID,
                        student_name: student.student_name,
                        attendance: [attendanceRecord]
                    });
                } else {
                    // Update attendance record for existing student
                    const existingStudent = existingSubject.students.find(stud => stud.student_id.toString() === studentID);
                    existingStudent.attendance.push(attendanceRecord);
                }
            }
        }

        // Save the updated attendance document
        await attendance.save();
        res.status(200).json({ message: 'Attendance marked successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});























/**********************************************************************************************************************************************************************************
 *  Get the attendances of specific subject
*********************************************************************************************************************************************************************************** */

router.get('/api/attendance/subject/:subjectCode', authMiddleware(['Admin','Teacher']),async (req, res) => {
    const { subjectCode } = req.params;
    try {
        // Find attendance records for the specified subject code
        const attendance = await Attendance.find({ 'years.department.branch.classes.subject.subject_code': subjectCode });

        if (!attendance) {
            return res.status(404).send({ message: `Attendance records for subject ${subjectCode} not found` });
        }

        res.send(attendance);
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Get the attendances of the specific student
*********************************************************************************************************************************************************************************** */

router.get('/api/attendance/student/:studentId',authMiddleware(['Admin','Teacher','student']), async (req, res) => {
    const { studentId } = req.params;
    try {
        // Find attendance records for the specified student ID
        const attendance = await Attendance.find({ 'years.department.branch.classes.subject.students.student_id': studentId });

        if (!attendance) {
            return res.status(404).send({ message: `Attendance records for student ${studentId} not found` });
        }

        res.send(attendance);
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Get the attendances of the specific class
*********************************************************************************************************************************************************************************** */

router.get('/api/attendance/class/:classId',authMiddleware(['Admin','Teacher']), async (req, res) => {
    const { classId } = req.params;
    try {
        // Find attendance records for the specified class ID
        const attendance = await Attendance.find({ 'years.department.branch.classes.class_id': classId });

        if (!attendance) {
            return res.status(404).send({ message: `Attendance records for class ${classId} not found` });
        }

        res.send(attendance);
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Get the attendances of the specific student for the specific subject
*********************************************************************************************************************************************************************************** */

router.get('/api/attendance/student/:studentId/subject/:subjectCode', authMiddleware(['Admin','Teacher','student']), async (req, res) => {
    const { studentId, subjectCode } = req.params;
    try {
        const attendance = await Attendance.find({ 
            'years.department.branch.classes.subject.subject_code': subjectCode,
            'years.department.branch.classes.subject.students.student_id': studentId
        });

        if (!attendance) {
            return res.status(404).send({ message: `Attendance records for student ${studentId} and subject ${subjectCode} not found` });
        }

        res.send(attendance);
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Update the attendance of the students on the specific date for the specific subject
*********************************************************************************************************************************************************************************** */

router.put('/api/attendance/update', authMiddleware(['Admin','Teacher']),async (req, res) => {
    const attendanceUpdates = req.body; // Assuming request body contains an array of attendance updates

    try {
        // Iterate through each attendance update and update the corresponding attendance record
        await Promise.all(attendanceUpdates.map(async update => {
            const { studentId, date, status, subjectCode } = update;

            // Find attendance record for the specified student, subject, and date and update status
            await Attendance.updateOne(
                { 
                    'years.department.classes.subject.subject_code': subjectCode,
                    'years.department.classes.subject.students.student_id': studentId,
                    'years.department.classes.subject.students.attendance.date': date 
                },
                { 
                    $set: { 
                        'years.$[yearElem].department.$[deptElem].classes.$[classElem].subject.$[subjectElem].students.$[studentElem].attendance.$[elem].status': status 
                    } 
                },
                { 
                    arrayFilters: [
                        { 'yearElem.batch': { $exists: true } },
                        { 'deptElem.branch': { $exists: true } },
                        { 'classElem.section': { $exists: true } },
                        { 'subjectElem.subject_code': subjectCode },
                        { 'studentElem.student_id': studentId },
                        { 'elem.date': date }
                    ] 
                }
            );
        }));
        res.send({ message: 'Attendance records updated successfully' });
    } catch (err) {
        console.error('Error updating attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Delete the attendance of specific class of the specific date
*********************************************************************************************************************************************************************************** */

router.delete('/api/attendance/:classId/date/:date',authMiddleware(['Admin','Teacher']), async (req, res) => {
    const { classId, date } = req.params;
    try {
        // Delete attendance records for the specified class and date
        const result = await Attendance.updateMany(
            { 'years.department.branch.classes.class_id': classId },
            { $pull: { 'years.$[].department.$[].branch.$[].classes.$[].subject.$[].students.$[].attendance': { date: new Date(date) } } }
        );

        console.log(`${result.nModified} attendance records deleted for class ${classId} on date ${date}`);
        res.send({ message: 'Attendance records deleted successfully' });
    } catch (err) {
        console.error('Error deleting attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Delete the attendance of specific Subject on the specific date for the specific class
*********************************************************************************************************************************************************************************** */

router.delete('/api/attendance/:classId/:subjectCode/date/:date',authMiddleware(['Admin','Teacher']), async (req, res) => {
    const { classId, subjectCode, date } = req.params;
    try {
        const result = await Attendance.updateMany(
            { 
                'years.department.branch.classes.class_id': classId,
                'years.department.branch.classes.subject.subject_code': subjectCode,
                'years.department.branch.classes.subject.students.attendance.date': new Date(date)
            },
            { $pull: { 'years.$[].department.$[].branch.$[].classes.$[].subject.$[].students.$[].attendance': { date: new Date(date) } } }
        );

        console.log(`${result.nModified} attendance records deleted for subject ${subjectCode}, class ${classId}, on date ${date}`);
        res.send({ message: 'Attendance records deleted successfully' });
    } catch (err) {
        console.error('Error deleting attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});










/**********************************************************************************************************************************************************************************
 *  Delete the attendance of specific Subject of the specific class
*********************************************************************************************************************************************************************************** */

router.delete('/api/attendance/:classId/:subjectCode',authMiddleware(['Admin','Teacher']), async (req, res) => {
    const { classId, subjectCode } = req.params;
    try {
        const result = await Attendance.updateMany(
            { 
                'years.department.branch.classes.class_id': classId,
                'years.department.branch.classes.subject.subject_code': subjectCode 
            },
            { $unset: { 'years.$[].department.$[].branch.$[].classes.$[].subject.$[subjectElem].students.$[].attendance': '' } },
            { arrayFilters: [{ 'subjectElem.subject_code': subjectCode }] }
        );

        console.log(`${result.nModified} attendance records deleted for subject ${subjectCode} in class ${classId}`);
        res.send({ message: 'Attendance records deleted successfully' });
    } catch (err) {
        console.error('Error deleting attendance:', err);
        res.status(500).send({ message: 'Internal server error' });
    }
});



module.exports = router;
