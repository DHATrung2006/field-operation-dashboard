/**
 * Mock data based on the real Excel data structure provided.
 * Replace with real API calls once Google Apps Script endpoints are confirmed.
 */

export const SUPERVISORS = [
  'Nguyễn Thị Thảo', 'CHIEN', 'Lê Văn Hùng', 'Trần Thị Mai',
  'Phạm Văn Nam', 'Hoàng Thị Lan', 'Đặng Văn Tuấn',
];

export const PROJECTS = ['BA VINDA', 'STMB', 'Maggi', 'P&G', 'AEON BA', 'Unilever'];
export const BRANDS   = ['VINDA', 'P&G', 'Maggi', 'AEON', 'Unilever'];
export const REGIONS  = ['HCM', 'HN', 'Tỉnh'];

// ──────────────────────────────────────────────
// TAB 1 — SUMMARY data
// ──────────────────────────────────────────────
export const SUMMARY_DATA = {
  totalBA: 320,
  totalProjects: 6,
  storesByRegion: { HCM: 54, HN: 48, Tỉnh: 42 },
  baWorking: 298,
  baVacant: 22,
  stores: [
    { id:'AE0003', name:'Aeon Hà Đông',       project:'BA VINDA',  brand:'VINDA',   sup:'Nguyễn Thị Thảo', region:'HN',  baStatus:'old', baCount:1, totalBA:1 },
    { id:'AE0005', name:'Aeon Long Biên',      project:'BA VINDA',  brand:'VINDA',   sup:'Nguyễn Thị Thảo', region:'HN',  baStatus:'new', baCount:1, totalBA:1 },
    { id:'LCM007', name:'Lan Chi Tam Điệp',    project:'STMB',      brand:'P&G',     sup:'CHIEN',            region:'Tỉnh',baStatus:'old', baCount:2, totalBA:2 },
    { id:'LT001',  name:'Lotte Ba Đình',       project:'Maggi',     brand:'Maggi',   sup:'CHIEN',            region:'HN',  baStatus:'new', baCount:0, totalBA:1 },
    { id:'LT002',  name:'Lotte Đống Đa',       project:'Maggi',     brand:'Maggi',   sup:'CHIEN',            region:'HN',  baStatus:'old', baCount:1, totalBA:1 },
    { id:'MM001',  name:'MM Mega Market HCM',  project:'P&G',       brand:'P&G',     sup:'Lê Văn Hùng',      region:'HCM', baStatus:'old', baCount:2, totalBA:2 },
    { id:'MM002',  name:'MM Mega Bình Dương',  project:'P&G',       brand:'P&G',     sup:'Lê Văn Hùng',      region:'HCM', baStatus:'new', baCount:1, totalBA:2 },
    { id:'BC001',  name:'BigC Thủ Đức',        project:'AEON BA',   brand:'AEON',    sup:'Trần Thị Mai',     region:'HCM', baStatus:'old', baCount:3, totalBA:3 },
    { id:'BC002',  name:'BigC Gò Vấp',         project:'AEON BA',   brand:'AEON',    sup:'Trần Thị Mai',     region:'HCM', baStatus:'old', baCount:2, totalBA:2 },
    { id:'UL001',  name:'Unilever Da Nang',    project:'Unilever',  brand:'Unilever',sup:'Phạm Văn Nam',     region:'Tỉnh',baStatus:'new', baCount:0, totalBA:2 },
    { id:'VN001',  name:'Vincom Đà Nẵng',      project:'STMB',      brand:'P&G',     sup:'Phạm Văn Nam',     region:'Tỉnh',baStatus:'old', baCount:1, totalBA:1 },
    { id:'VN002',  name:'Vincom Bà Triệu',     project:'BA VINDA',  brand:'VINDA',   sup:'Hoàng Thị Lan',    region:'HN',  baStatus:'old', baCount:2, totalBA:2 },
    { id:'CK001',  name:'Coopmart Kỳ Đồng',   project:'Unilever',  brand:'Unilever',sup:'Đặng Văn Tuấn',    region:'HCM', baStatus:'old', baCount:2, totalBA:2 },
    { id:'AE0010', name:'Aeon Bình Tân',       project:'BA VINDA',  brand:'VINDA',   sup:'Lê Văn Hùng',      region:'HCM', baStatus:'new', baCount:1, totalBA:1 },
    { id:'LT010',  name:'Lotte Cầu Giấy',      project:'Maggi',     brand:'Maggi',   sup:'CHIEN',            region:'HN',  baStatus:'old', baCount:1, totalBA:1 },
  ],
};

// ──────────────────────────────────────────────
// TAB 2 — BA SCHEDULE data
// ──────────────────────────────────────────────
// Based on Excel columns: MartCode, StoreName, Project, Brand, Region, Detail,
// SupName, StartDate, EndDate, ShiftMon_Morning/Afternoon, ..., Fri, Sat, Sun, Note
export const SCHEDULE_DATA = [
  {
    id:'AE0003', store:'Aeon Hà Đông',       project:'BA VINDA', brand:'VINDA',   region:'HN',  detail:'Hà Nội',    sup:'Nguyễn Thị Thảo',
    startDate:'2026-01-01', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'', afternoon:'15:30-21:30' },
      tue:{ morning:'', afternoon:'15:30-21:30' },
      wed:{ morning:'', afternoon:'15:30-21:30' },
      thu:{ morning:'', afternoon:'' },
      fri:{ morning:'', afternoon:'15:30-21:30' },
      sat:{ morning:'', afternoon:'15:30-21:30' },
      sun:{ morning:'', afternoon:'15:30-21:30' },
    },
    breakTime:'17:00-17:30', totalWorkingDays:6,
    monthlyTarget:26, baStatus:'old', qcLastWeek:95,
  },
  {
    id:'AE0005', store:'Aeon Long Biên',     project:'BA VINDA', brand:'VINDA',   region:'HN',  detail:'Hà Nội',    sup:'Nguyễn Thị Thảo',
    startDate:'2026-05-01', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'', afternoon:'15:00-21:00' },
      tue:{ morning:'', afternoon:'15:00-21:00' },
      wed:{ morning:'', afternoon:'' },
      thu:{ morning:'', afternoon:'15:00-21:00' },
      fri:{ morning:'', afternoon:'15:00-21:00' },
      sat:{ morning:'08:30-11:30', afternoon:'15:00-21:00' },
      sun:{ morning:'08:30-11:30', afternoon:'15:00-21:00' },
    },
    breakTime:'17:30-18:00', totalWorkingDays:7,
    monthlyTarget:28, baStatus:'new', qcLastWeek:82,
  },
  {
    id:'LCM007', store:'Lan Chi Tam Điệp',   project:'STMB',     brand:'P&G',     region:'Tỉnh',detail:'Hạ Long',   sup:'CHIEN',
    startDate:'2026-04-17', endDate:'2026-09-28',
    shifts:{
      mon:{ morning:'', afternoon:'' },
      tue:{ morning:'', afternoon:'' },
      wed:{ morning:'', afternoon:'' },
      thu:{ morning:'', afternoon:'16:00-21:00' },
      fri:{ morning:'', afternoon:'16:00-21:00' },
      sat:{ morning:'08:30-11:30', afternoon:'15:00-21:00' },
      sun:{ morning:'08:30-11:30', afternoon:'15:00-21:00' },
    },
    breakTime:'18:00-18:30', totalWorkingDays:6,
    monthlyTarget:20, baStatus:'old', qcLastWeek:88,
  },
  {
    id:'LT002', store:'Lotte Đống Đa',       project:'Maggi',    brand:'Maggi',   region:'HN',  detail:'Hà Nội',    sup:'CHIEN',
    startDate:'2026-03-01', endDate:'2026-11-30',
    shifts:{
      mon:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      tue:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      wed:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      thu:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      fri:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      sat:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      sun:{ morning:'', afternoon:'' },
    },
    breakTime:'12:00-13:00', totalWorkingDays:26,
    monthlyTarget:26, baStatus:'old', qcLastWeek:91,
  },
  {
    id:'MM001', store:'MM Mega Market HCM',  project:'P&G',      brand:'P&G',     region:'HCM', detail:'TP.HCM',    sup:'Lê Văn Hùng',
    startDate:'2026-01-01', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'08:00-12:00', afternoon:'13:00-17:00' },
      tue:{ morning:'08:00-12:00', afternoon:'13:00-17:00' },
      wed:{ morning:'08:00-12:00', afternoon:'13:00-17:00' },
      thu:{ morning:'08:00-12:00', afternoon:'13:00-17:00' },
      fri:{ morning:'08:00-12:00', afternoon:'13:00-17:00' },
      sat:{ morning:'08:00-12:00', afternoon:'13:00-17:00' },
      sun:{ morning:'', afternoon:'' },
    },
    breakTime:'12:00-13:00', totalWorkingDays:26,
    monthlyTarget:26, baStatus:'old', qcLastWeek:97,
  },
  {
    id:'MM002', store:'MM Mega Bình Dương',  project:'P&G',      brand:'P&G',     region:'HCM', detail:'Bình Dương', sup:'Lê Văn Hùng',
    startDate:'2026-06-01', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'', afternoon:'14:00-20:00' },
      tue:{ morning:'', afternoon:'14:00-20:00' },
      wed:{ morning:'', afternoon:'' },
      thu:{ morning:'', afternoon:'14:00-20:00' },
      fri:{ morning:'', afternoon:'14:00-20:00' },
      sat:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      sun:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
    },
    breakTime:'17:00-17:30', totalWorkingDays:22,
    monthlyTarget:22, baStatus:'new', qcLastWeek:76,
  },
  {
    id:'BC001', store:'BigC Thủ Đức',        project:'AEON BA',  brand:'AEON',    region:'HCM', detail:'TP.HCM',    sup:'Trần Thị Mai',
    startDate:'2026-02-01', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      tue:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      wed:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      thu:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      fri:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      sat:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      sun:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
    },
    breakTime:'12:00-13:00', totalWorkingDays:26,
    monthlyTarget:26, baStatus:'old', qcLastWeek:100,
  },
  {
    id:'UL001', store:'Unilever Da Nang',    project:'Unilever', brand:'Unilever', region:'Tỉnh',detail:'Đà Nẵng',   sup:'Phạm Văn Nam',
    startDate:'2026-07-01', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'', afternoon:'14:00-20:00' },
      tue:{ morning:'', afternoon:'14:00-20:00' },
      wed:{ morning:'', afternoon:'14:00-20:00' },
      thu:{ morning:'', afternoon:'14:00-20:00' },
      fri:{ morning:'', afternoon:'14:00-20:00' },
      sat:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
      sun:{ morning:'09:00-12:00', afternoon:'14:00-20:00' },
    },
    breakTime:'17:00-17:30', totalWorkingDays:20,
    monthlyTarget:20, baStatus:'new', qcLastWeek:0,
  },
  {
    id:'CK001', store:'Coopmart Kỳ Đồng',   project:'Unilever', brand:'Unilever', region:'HCM', detail:'TP.HCM',    sup:'Đặng Văn Tuấn',
    startDate:'2026-01-15', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      tue:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      wed:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      thu:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      fri:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      sat:{ morning:'08:00-12:00', afternoon:'13:00-18:00' },
      sun:{ morning:'', afternoon:'' },
    },
    breakTime:'12:00-13:00', totalWorkingDays:25,
    monthlyTarget:26, baStatus:'old', qcLastWeek:93,
  },
  {
    id:'AE0010', store:'Aeon Bình Tân',      project:'BA VINDA', brand:'VINDA',   region:'HCM', detail:'TP.HCM',    sup:'Lê Văn Hùng',
    startDate:'2026-06-15', endDate:'2026-12-31',
    shifts:{
      mon:{ morning:'', afternoon:'15:30-21:30' },
      tue:{ morning:'', afternoon:'15:30-21:30' },
      wed:{ morning:'', afternoon:'15:30-21:30' },
      thu:{ morning:'', afternoon:'15:30-21:30' },
      fri:{ morning:'', afternoon:'15:30-21:30' },
      sat:{ morning:'', afternoon:'15:30-21:30' },
      sun:{ morning:'', afternoon:'15:30-21:30' },
    },
    breakTime:'18:00-18:30', totalWorkingDays:26,
    monthlyTarget:26, baStatus:'new', qcLastWeek:79,
  },
];

// ──────────────────────────────────────────────
// TAB 3 — HR RECRUITMENT data
// ──────────────────────────────────────────────
export const HR_DATA = [
  { store:'Lotte Ba Đình',     project:'Maggi',    brand:'Maggi',   sup:'CHIEN',           recruitType:'Tuyển thay thế', status:'Sourcing',        shopStatus:'Thay thế',  vacantDate:'2026-07-28', targetWeek:'Week 30/26', hrCommit:1, filled:0 },
  { store:'Unilever Da Nang',  project:'Unilever', brand:'Unilever',sup:'Phạm Văn Nam',    recruitType:'Tuyển mới',      status:'Interviewing',    shopStatus:'Trống mới', vacantDate:'2026-07-01', targetWeek:'Week 29/26', hrCommit:2, filled:0 },
  { store:'MM Mega Bình Dương',project:'P&G',      brand:'P&G',     sup:'Lê Văn Hùng',     recruitType:'Tuyển thay thế', status:'Offer Sent',      shopStatus:'Thay thế',  vacantDate:'2026-06-20', targetWeek:'Week 28/26', hrCommit:1, filled:1 },
  { store:'Aeon Long Biên',    project:'BA VINDA', brand:'VINDA',   sup:'Nguyễn Thị Thảo', recruitType:'Tuyển mới',      status:'Onboarding',      shopStatus:'Mới khai trương',vacantDate:'2026-05-01', targetWeek:'Week 26/26', hrCommit:1, filled:1 },
  { store:'BigC Gò Vấp',       project:'AEON BA',  brand:'AEON',    sup:'Trần Thị Mai',    recruitType:'Tuyển thay thế', status:'Training',        shopStatus:'Thay thế',  vacantDate:'2026-07-10', targetWeek:'Week 29/26', hrCommit:1, filled:1 },
  { store:'Vincom Đà Nẵng',    project:'STMB',     brand:'P&G',     sup:'Phạm Văn Nam',    recruitType:'Tuyển thay thế', status:'Sourcing',        shopStatus:'Thay thế',  vacantDate:'2026-07-25', targetWeek:'Week 31/26', hrCommit:1, filled:0 },
  { store:'Aeon Bình Tân',     project:'BA VINDA', brand:'VINDA',   sup:'Lê Văn Hùng',     recruitType:'Tuyển mới',      status:'Sourcing',        shopStatus:'Mới khai trương',vacantDate:'2026-06-15', targetWeek:'Week 27/26', hrCommit:2, filled:1 },
  { store:'Lan Chi Tam Điệp',  project:'STMB',     brand:'P&G',     sup:'CHIEN',           recruitType:'Tuyển thay thế', status:'Completed',       shopStatus:'Đã có BA',  vacantDate:'2026-04-17', targetWeek:'Week 20/26', hrCommit:2, filled:2 },
  { store:'Lotte Cầu Giấy',    project:'Maggi',    brand:'Maggi',   sup:'CHIEN',           recruitType:'Tuyển thay thế', status:'Interviewing',    shopStatus:'Thay thế',  vacantDate:'2026-07-20', targetWeek:'Week 30/26', hrCommit:1, filled:0 },
  { store:'Coopmart Kỳ Đồng',  project:'Unilever', brand:'Unilever',sup:'Đặng Văn Tuấn',   recruitType:'Tuyển thay thế', status:'Completed',       shopStatus:'Đã có BA',  vacantDate:'2026-01-15', targetWeek:'Week 05/26', hrCommit:2, filled:2 },
];

export const HR_WEEKLY_TREND = [
  { week:'W24', sourcing:3, interviewing:2, offer:1, training:1, completed:0, resigned:1 },
  { week:'W25', sourcing:4, interviewing:3, offer:2, training:2, completed:1, resigned:2 },
  { week:'W26', sourcing:2, interviewing:4, offer:3, training:1, completed:2, resigned:0 },
  { week:'W27', sourcing:5, interviewing:2, offer:2, training:3, completed:2, resigned:1 },
  { week:'W28', sourcing:3, interviewing:3, offer:1, training:2, completed:3, resigned:2 },
  { week:'W29', sourcing:4, interviewing:2, offer:2, training:1, completed:1, resigned:1 },
  { week:'W30', sourcing:6, interviewing:3, offer:1, training:2, completed:2, resigned:2 },
];

// ──────────────────────────────────────────────
// TAB 4 — UFF CHECKIN / BÁOCÁO data (mock)
// ──────────────────────────────────────────────
export const UFF_CHECKIN_DATA = [
  { date:'2026-07-03', storeCode:'AE0003', storeName:'Aeon Hà Đông',    project:'BA VINDA', brand:'VINDA',   workingTime:'15:30-21:30', sup:'Nguyễn Thị Thảo', status:'Active',   region:'HN',  detail:'Hà Nội',    checkinTime:'15:28', checkoutTime:'21:35', photo:'https://picsum.photos/seed/AE003a/200/150', qcScore:95 },
  { date:'2026-07-03', storeCode:'LCM007', storeName:'Lan Chi Tam Điệp',project:'STMB',     brand:'P&G',     workingTime:'16:00-21:00', sup:'CHIEN',           status:'Active',   region:'Tỉnh',detail:'Hạ Long',   checkinTime:'15:58', checkoutTime:'21:05', photo:'https://picsum.photos/seed/LCM07b/200/150', qcScore:88 },
  { date:'2026-07-03', storeCode:'MM001',  storeName:'MM Mega Market',  project:'P&G',      brand:'P&G',     workingTime:'08:00-17:00', sup:'Lê Văn Hùng',     status:'Active',   region:'HCM', detail:'TP.HCM',   checkinTime:'07:55', checkoutTime:'17:02', photo:'https://picsum.photos/seed/MM001c/200/150', qcScore:97 },
  { date:'2026-07-03', storeCode:'BC001',  storeName:'BigC Thủ Đức',   project:'AEON BA',  brand:'AEON',    workingTime:'08:00-18:00', sup:'Trần Thị Mai',    status:'Late',     region:'HCM', detail:'TP.HCM',   checkinTime:'08:15', checkoutTime:'18:00', photo:'https://picsum.photos/seed/BC001d/200/150', qcScore:80 },
  { date:'2026-07-04', storeCode:'AE0003', storeName:'Aeon Hà Đông',    project:'BA VINDA', brand:'VINDA',   workingTime:'15:30-21:30', sup:'Nguyễn Thị Thảo', status:'Active',   region:'HN',  detail:'Hà Nội',    checkinTime:'15:30', checkoutTime:'21:30', photo:'https://picsum.photos/seed/AE003e/200/150', qcScore:95 },
  { date:'2026-07-04', storeCode:'CK001',  storeName:'Coopmart Kỳ Đồng',project:'Unilever',brand:'Unilever',workingTime:'08:00-18:00', sup:'Đặng Văn Tuấn',   status:'Active',   region:'HCM', detail:'TP.HCM',   checkinTime:'07:58', checkoutTime:'18:02', photo:'https://picsum.photos/seed/CK001f/200/150', qcScore:93 },
  { date:'2026-07-04', storeCode:'UL001',  storeName:'Unilever Da Nang',project:'Unilever', brand:'Unilever',workingTime:'14:00-20:00', sup:'Phạm Văn Nam',    status:'Absent',   region:'Tỉnh',detail:'Đà Nẵng',   checkinTime:null,    checkoutTime:null,    photo:null,                                           qcScore:0  },
  { date:'2026-07-07', storeCode:'AE0005', storeName:'Aeon Long Biên',  project:'BA VINDA', brand:'VINDA',   workingTime:'15:00-21:00', sup:'Nguyễn Thị Thảo', status:'Active',   region:'HN',  detail:'Hà Nội',    checkinTime:'15:00', checkoutTime:'21:05', photo:'https://picsum.photos/seed/AE005g/200/150', qcScore:82 },
  { date:'2026-07-07', storeCode:'MM002',  storeName:'MM Mega Bình Dương',project:'P&G',    brand:'P&G',     workingTime:'14:00-20:00', sup:'Lê Văn Hùng',     status:'Active',   region:'HCM', detail:'Bình Dương',checkinTime:'14:02', checkoutTime:'20:00', photo:'https://picsum.photos/seed/MM002h/200/150', qcScore:76 },
];
