erd: https://drive.google.com/file/d/1Ny4JEp7uLZxBcBtZGKp30qnWEJ5OW-r3/view?usp=sharing

-- Bảng USER
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(100),
    matkhau VARCHAR(255),
    email VARCHAR(100) UNIQUE,
    ngaysinh DATE
);

-- Bảng KHOÁ HỌC
CREATE TABLE khoahoc (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    thoiluong INT,
    mota TEXT,
    danhgia INT,
    id_baikiemtra INT
);

-- Bảng BÀI HỌC
CREATE TABLE baihoc (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    thoiluong INT,
    loai VARCHAR(50),
    danhgia INT,
    capdo VARCHAR(50),
    id_khoahoc INT
);

-- Bảng TÀI LIỆU
CREATE TABLE tailieu (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    loai VARCHAR(100),
    url TEXT,
    id_baihoc INT
);

-- Bảng BÀI KIỂM TRA
CREATE TABLE baikiemtra (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    thoiluong INT
);

-- Bảng NỘI DUNG KIỂM TRA
CREATE TABLE noidungkiemtra (
    id SERIAL PRIMARY KEY,
    cauhoi TEXT,
    dapan TEXT,
    id_baikiemtra INT
);

-- Bảng USER_KHOAHOC
CREATE TABLE user_khoahoc (
    user_id INT,
    khoahoc_id INT,
    trangthai VARCHAR(50),
    PRIMARY KEY (user_id, khoahoc_id)
);

-- Bảng USER_BAIHOC
CREATE TABLE user_baihoc (
    user_id INT,
    baihoc_id INT,
    trangthai_tailieu VARCHAR(50),
    trangthai_baitap VARCHAR(50),
    hoanthanh_baihoc BOOLEAN,
    PRIMARY KEY (user_id, baihoc_id)
);

-- Bảng USER_BAIKIEMTRA
CREATE TABLE user_baikiemtra (
    user_id INT,
    baikiemtra_id INT,
    trangthai VARCHAR(50),
    diemso INT,
    ngayhoanthanh DATE,
    PRIMARY KEY (user_id, baikiemtra_id)
);

-- Bảng TAG
CREATE TABLE tag (
    id SERIAL PRIMARY KEY,
    mota VARCHAR(100),
    id_khoahoc INT
);

-- Bảng LAB
CREATE TABLE lab (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    loai VARCHAR(100),
    mota TEXT
);

-- Bảng LAB_USER
CREATE TABLE lab_user (
    user_id INT,
    lab_id INT,
    tiendo INT,
    PRIMARY KEY (user_id, lab_id)
);

-- Bảng CTF
CREATE TABLE ctf (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    mota TEXT,
    loaictf VARCHAR(100),
    tacgia VARCHAR(100),
    choai VARCHAR(100)
);

-- Bảng CTF_USER
CREATE TABLE ctf_user (
    user_id INT,
    ctf_id INT,
    tiendo INT,
    PRIMARY KEY (user_id, ctf_id)
);

-- Bảng CHỦ ĐỀ AI
CREATE TABLE chudeai (
    id SERIAL PRIMARY KEY,
    ten VARCHAR(200),
    mota TEXT,
    userid INT
);

-- Bảng HỎI ĐÁP AI
CREATE TABLE hoidapai (
    id SERIAL PRIMARY KEY,
    cauhoi TEXT,
    cautraloi TEXT,
    thoigian TIMESTAMP,
    id_chudeai INT
);

-- KHOÁ NGOẠI
ALTER TABLE baihoc
    ADD CONSTRAINT fk_baihoc_khoahoc FOREIGN KEY (id_khoahoc) REFERENCES khoahoc(id);

ALTER TABLE tailieu
    ADD CONSTRAINT fk_tailieu_baihoc FOREIGN KEY (id_baihoc) REFERENCES baihoc(id);

ALTER TABLE khoahoc
    ADD CONSTRAINT fk_khoahoc_baikiemtra FOREIGN KEY (id_baikiemtra) REFERENCES baikiemtra(id);

ALTER TABLE noidungkiemtra
    ADD CONSTRAINT fk_noidung_baikiemtra FOREIGN KEY (id_baikiemtra) REFERENCES baikiemtra(id);

ALTER TABLE user_khoahoc
    ADD CONSTRAINT fk_userkhoahoc_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD CONSTRAINT fk_userkhoahoc_khoahoc FOREIGN KEY (khoahoc_id) REFERENCES khoahoc(id);

ALTER TABLE user_baihoc
    ADD CONSTRAINT fk_userbaihoc_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD CONSTRAINT fk_userbaihoc_baihoc FOREIGN KEY (baihoc_id) REFERENCES baihoc(id);

ALTER TABLE user_baikiemtra
    ADD CONSTRAINT fk_userbaikiemtra_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD CONSTRAINT fk_userbaikiemtra_baikiemtra FOREIGN KEY (baikiemtra_id) REFERENCES baikiemtra(id);

ALTER TABLE tag
    ADD CONSTRAINT fk_tag_khoahoc FOREIGN KEY (id_khoahoc) REFERENCES khoahoc(id);

ALTER TABLE lab_user
    ADD CONSTRAINT fk_labuser_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD CONSTRAINT fk_labuser_lab FOREIGN KEY (lab_id) REFERENCES lab(id);

ALTER TABLE ctf_user
    ADD CONSTRAINT fk_ctfuser_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD CONSTRAINT fk_ctfuser_ctf FOREIGN KEY (ctf_id) REFERENCES ctf(id);

ALTER TABLE chudeai
    ADD CONSTRAINT fk_chudeai_user FOREIGN KEY (userid) REFERENCES users(id);

ALTER TABLE hoidapai
    ADD CONSTRAINT fk_hoidapai_chudeai FOREIGN KEY (id_chudeai) REFERENCES chudeai(id);

INSERT INTO users (ten, matkhau, email, ngaysinh) VALUES
('Nguyen Van A', 'hashed_pass_1', 'a@infosec.test', '1995-04-12'),
('Tran Thi B', 'hashed_pass_2', 'b@infosec.test', '1997-11-03'),
('Le Van C', 'hashed_pass_3', 'c@infosec.test', '1992-08-20'),
('Pham Thi D', 'hashed_pass_4', 'd@infosec.test', '2000-01-30');

-- ============================
-- 2) BÀI KIỂM TRA (baikiemtra)
-- ============================
INSERT INTO baikiemtra (ten, thoiluong) VALUES
('Quiz: Tổng quan an ninh mạng', 20),
('Practical: Malware Analysis Lab Test', 90),
('Quiz & Lab: Web Pentesting', 60);

-- ============================
-- 3) NỘI DUNG KIỂM TRA (noidungkiemtra)
--    (nội dung / câu hỏi cho mỗi baikiemtra)
-- ============================
-- Baikiemtra id = 1
INSERT INTO noidungkiemtra (cauhoi, dapan, id_baikiemtra) VALUES
('An attack that intercepts communication between two parties is called?', 'Man-in-the-Middle', 1),
('Which layer of OSI is responsible for routing?', 'Network layer', 1);

-- Baikiemtra id = 2 (practical => có thể lưu mô tả task)
INSERT INTO noidungkiemtra (cauhoi, dapan, id_baikiemtra) VALUES
('Submit analysis report describing how the sample persists on host', 'Report expected', 2);

-- Baikiemtra id = 3
INSERT INTO noidungkiemtra (cauhoi, dapan, id_baikiemtra) VALUES
('Name one common injection vulnerability in web apps', 'SQL Injection', 3),
('Which header helps mitigate XSS?', 'Content-Security-Policy', 3);

-- ============================
-- 4) KHÓA HỌC (khoahoc)
--    (tham chiếu id_baikiemtra đã có)
-- ============================
INSERT INTO khoahoc (ten, thoiluong, mota, danhgia, id_baikiemtra) VALUES
('Nhập môn An ninh mạng', 40, 'Giới thiệu khái niệm an ninh, model tấn công, phòng thủ cơ bản', 5, 1),
('Phân tích Malware và Reverse', 60, 'Kỹ thuật phân tích mã độc tĩnh và động, sandbox, báo cáo', 4, 2),
('Pentesting Web nâng cao', 50, 'Kiểm thử xâm nhập ứng dụng web, SQLi, XSS, authentication flaws', 5, 3);

-- ============================
-- 5) BÀI HỌC (baihoc) — tham chiếu id_khoahoc
-- ============================
-- Khoahoc id = 1
INSERT INTO baihoc (ten, thoiluong, loai, danhgia, capdo, id_khoahoc) VALUES
('Tổng quan về an ninh mạng', 60, 'pre', 5, 'Cơ bản', 1),
('Mô hình tấn công & phòng thủ', 45, 'core', 5, 'Cơ bản', 1);

-- Khoahoc id = 2
INSERT INTO baihoc (ten, thoiluong, loai, danhgia, capdo, id_khoahoc) VALUES
('Static Analysis cơ bản', 90, 'core', 4, 'Trung cấp', 2),
('Dynamic Analysis với sandbox', 120, 'core', 4, 'Trung cấp', 2);

-- Khoahoc id = 3
INSERT INTO baihoc (ten, thoiluong, loai, danhgia, capdo, id_khoahoc) VALUES
('Các kỹ thuật SQL Injection', 80, 'core', 5, 'Trung cấp', 3),
('Cross-Site Scripting (XSS)', 70, 'core', 5, 'Trung cấp', 3),
('Authentication & Session flaws', 60, 'core', 5, 'Trung cấp', 3);

-- ============================
-- 6) TÀI LIỆU (tailieu) — tham chiếu id_baihoc
-- ============================
INSERT INTO tailieu (ten, loai, url, id_baihoc) VALUES
('Slides: Tổng quan an ninh mạng', 'pdf', 'https://resources.infosec/test/intro.pdf', 1),
('Reading: Threat model cheatsheet', 'pdf', 'https://resources.infosec/test/threat_model.pdf', 2),
('Guide: Static malware analysis', 'pdf', 'https://resources.infosec/test/static_analysis.pdf', 3),
('Tutorial: Using a sandbox', 'pdf', 'https://resources.infosec/test/sandbox_tutorial.pdf', 4),
('Cheatsheet: SQL Injection payloads', 'pdf', 'https://resources.infosec/test/sqli_cheatsheet.pdf', 5),
('Guide: XSS examples and mitigation', 'pdf', 'https://resources.infosec/test/xss_guide.pdf', 6);

-- ============================
-- 7) TAG (tag) — gắn tag cho khoá học
-- ============================
INSERT INTO tag (mota, id_khoahoc) VALUES
('an ninh cơ bản', 1),
('threat-modeling', 1),
('malware-analysis', 2),
('reverse-engineering', 2),
('web-pentesting', 3),
('injection', 3);

-- ============================
-- 8) LAB (lab) — môi trường thực hành
-- ============================
INSERT INTO lab (ten, loai, mota) VALUES
('Lab: Môi trường sandbox mẫu', 'cloud', 'Sandbox để phân tích file nghi ngờ'),
('Lab: Virtual Web App (vuln)', 'vm', 'Ứng dụng web có lỗ hổng để pentest'),
('Lab: Network Packet Capture', 'network', 'Ghi lại và phân tích packet');

-- ============================
-- 9) CTF (ctf) — thử thách/CTF
-- ============================
INSERT INTO ctf (ten, mota, loaictf, tacgia, choai) VALUES
('CTF: Forensics 101', 'Khóa Forensics cơ bản: tìm file ẩn, decode', 'Forensics', 'TeamX', 'Sinh viên'),
('CTF: Web Exploit Challenge', 'Thử thách SQLi & XSS', 'Web', 'TeamY', 'Mọi người'),
('CTF: Malware Reversing', 'Task nhỏ reverse một binary', 'Reversing', 'TeamZ', 'Người học');

-- ============================
-- 10) CHỦ ĐỀ AI (chudeai) và HỎI ĐÁP AI (hoidapai)
-- ============================
-- Chudeai: ví dụ do user id = 1 tạo
INSERT INTO chudeai (ten, mota, userid) VALUES
('Tư vấn công cụ phân tích malware', 'Cách chọn tool, workflow phân tích mã độc', 1),
('Hỏi đáp Pentesting', 'Các câu hỏi thường gặp khi pentest', 2);

-- Hoidapai: tham chiếu id_chudeai
INSERT INTO hoidapai (cauhoi, cautraloi, thoigian, id_chudeai) VALUES
('Nên dùng Ghidra hay IDA cho reverse?', 'Ghidra miễn phí, đủ chức năng cho hầu hết bài tập; IDA mạnh nhưng trả phí.', now(), 1),
('Làm sao bắt đầu học SQLi?', 'Bắt đầu từ lý thuyết, sau đó practice trên DVWA/Mutillidae', now(), 2);

-- ============================
-- 11) LAB_USER (lab_user) — tiến độ lab của user
-- ============================
-- user_id 1 làm lab 1 đến 40%, user 2 làm lab 2 đã hoàn thành 100%
INSERT INTO lab_user (user_id, lab_id, tiendo) VALUES
(1, 1, 40),
(2, 2, 100),
(3, 2, 20);

-- ============================
-- 12) CTF_USER (ctf_user) — tiến độ CTF
-- ============================
INSERT INTO ctf_user (user_id, ctf_id, tiendo) VALUES
(1, 1, 50),
(2, 2, 100),
(4, 3, 0);

-- ============================
-- 13) USER_KHOAHOC (user_khoahoc) — user ghi danh khoá
-- ============================
-- user 1 và 2 ghi danh vào khóa 1, user 3 vào khóa 2, user4 vào khóa 3
INSERT INTO user_khoahoc (user_id, khoahoc_id, trangthai) VALUES
(1, 1, 'in-progress'),
(2, 1, 'completed'),
(3, 2, 'in-progress'),
(4, 3, 'not-started');

-- ============================
-- 14) USER_BAIHOC (user_baihoc) — trạng thái bài học (tailieu / bài tập)
-- ============================
-- user 1: đã đọc tài liệu bài 1, chưa hoàn thành bài tập
INSERT INTO user_baihoc (user_id, baihoc_id, trangthai_tailieu, trangthai_baitap, hoanthanh_baihoc) VALUES
(1, 1, 'read', 'not-submitted', false),
(1, 2, 'read', 'submitted', false),
(2, 1, 'read', 'submitted', true),
(3, 3, 'not-read', 'not-submitted', false);

-- ============================
-- 15) USER_BAIKIEMTRA (user_baikiemtra) — kết quả test
-- ============================
-- user 2 đã làm quiz khóa 1, đạt 85; user1 làm quiz 1, điểm 70
INSERT INTO user_baikiemtra (user_id, baikiemtra_id, trangthai, diemso, ngayhoanthanh) VALUES
(2, 1, 'completed', 85, '2025-07-01'),
(1, 1, 'completed', 70, '2025-07-02'),
(3, 2, 'in-progress', NULL, NULL);
