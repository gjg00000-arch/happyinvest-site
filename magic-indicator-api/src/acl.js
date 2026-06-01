/** 게시판 카테고리별 읽기/쓰기 역할 (기획안) */
export const BOARD_ACL = {
  /** 메인 공지 전용 (운영만 작성) */
  announcement: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["admin"],
  },
  /**
   * 시황 분석(홈·운영) — 누구나 읽기, 글·댓글은 운영·구독·VIP (게스트·무료·체험은 열람만)
   */
  market_analysis: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["admin", "sub", "vip"],
    comment: ["admin", "sub", "vip"],
  },
  /**
   * 본부장 데일리 업무 보고 — 전용 페이지(head-daily-report).
   * 열람: 전 역할·게스트 | 작성: 운영·VIP(본부장 역할) | 댓글: 구독 이상
   */
  head_daily_report: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["admin", "vip"],
    comment: ["admin", "sub", "vip"],
  },
  general: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["guest", "free", "trial", "sub", "vip", "admin"],
  },
  /** Q&A — 게스트 포함 열람, 작성은 무료 회원 이상 */
  qa: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["free", "trial", "sub", "vip", "admin"],
  },
  beta: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["trial", "sub", "vip", "admin"],
  },
  event: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["free", "trial", "sub", "vip", "admin"],
  },
  /** 이벤트 페이지 전용 — 7일 체험 / MagicTrading 정규 / 2개월 리커버리 (정적 사이트와 동일 slug) */
  event_1w_free: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["free", "trial", "sub", "vip", "admin"],
  },
  event_1m_usd: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["free", "trial", "sub", "vip", "admin"],
  },
  event_6m_recovery: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["free", "trial", "sub", "vip", "admin"],
  },
  /** 책 구매인증·친구추천·홍보 인증 — 추천은 1달 이벤트와 무관, 운영 검토로 확정 */
  event_promo_shoutout: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["free", "trial", "sub", "vip", "admin"],
  },
  membership: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["sub", "vip", "admin"],
  },
  reflection: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["trial", "sub", "vip", "admin"],
  },
  /** 한눈에 보기(quickview 탭) — 게스트 포함 열람·글쓰기·댓글(기존 미정의 카테고리 동작과 동일하게 전 역할 허용) */
  quickview: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["guest", "free", "trial", "sub", "vip", "admin"],
    comment: ["guest", "free", "trial", "sub", "vip", "admin"],
  },
  /** 운영 입금 대조 로그(페이팔·에어월렉스·크립토) — 관리자·API만 사용, 일반 회원 접근 차단 */
  admin_payment_paypal: {
    read: ["admin"],
    write: ["admin"],
  },
  admin_payment_airwallex: {
    read: ["admin"],
    write: ["admin"],
  },
  admin_payment_crypto: {
    read: ["admin"],
    write: ["admin"],
  },
  /** 무료 쿠폰 추적 로그(mt5/trv/영웅문·발급 경로) — 관리자 전용 대기열 */
  admin_free_coupon: {
    read: ["admin"],
    write: ["admin"],
  },
  /**
   * 지표 옵티마이징 작업 로그 — 누구나 열람·댓글, 신규 글은 운영(관리자)만 (수정·삭제는 관리자 화면).
   */
  indicator_optimizing: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["admin"],
    comment: ["guest", "free", "trial", "sub", "vip", "admin"],
  },
  /** 개발자 일지 — 저장 DB slug. UI 탭 `indicator_optimizing` 과 동일 열람·댓글 정책 */
  developer_journal: {
    read: ["guest", "free", "trial", "sub", "vip", "admin"],
    write: ["admin"],
    comment: ["guest", "free", "trial", "sub", "vip", "admin"],
  },
};

const ROLES = new Set(["guest", "free", "trial", "sub", "vip", "admin"]);

export function getRole(req) {
  const r = String(req.user?.role || "guest").toLowerCase();
  return ROLES.has(r) ? r : "guest";
}

export function getUserId(req) {
  return String(req.user?.email || "").trim() || "anonymous";
}

export function canRead(category, role) {
  const acl = BOARD_ACL[category];
  if (!acl) return true;
  return acl.read.includes(role);
}

export function canWrite(category, role) {
  const acl = BOARD_ACL[category];
  if (!acl) return true;
  return acl.write.includes(role);
}

/**
 * 댓글: 카테고리에 `comment` 배열이 있으면 그 역할만, 없으면 열람 권한과 동일
 */
export function canComment(category, role) {
  const acl = BOARD_ACL[category];
  if (!acl) return true;
  if (acl.comment) return acl.comment.includes(role);
  return canRead(category, role);
}

export function sanitizeHtml(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-stripped=");
}
