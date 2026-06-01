#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PowerShell `deploy-s3-cloudfront.ps1` 와 동일 단계:
  npm run verify → aws s3 sync(main) → aws s3 sync(html, cache-control) → CloudFront invalidation(선택)

환경변수: AWS_S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, AWS_REGION, AWS_PROFILE(선택)
증명: 배포 전 `aws sts get-caller-identity` 로 확인하고, 실패·만료 시 `aws sso login`(SSO 프로필) 또는
  `aws login` 을 자동 호출한 뒤 한 번 더 검증합니다. (SSO/브라우저 확인이 필요하면 그때만 대화형)

실행 예:
  cd magic-indicator-site
  npm run deploy:s3:py
  # 또는
  python scripts/deploy_s3_cloudfront.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


def _configure_stdio_utf8() -> None:
    """Windows cp949 콘솔에서 한글/유니코드 print UnicodeEncodeError 방지."""
    if sys.platform != "win32":
        return
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


_configure_stdio_utf8()


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def prepend_aws_to_path() -> None:
    for d in (
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Amazon" / "AWSCLIV2",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Amazon" / "AWSCLIV2",
    ):
        aws_exe = d / "aws.exe"
        if aws_exe.is_file():
            os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")
            break


def find_npm_exe() -> str:
    if sys.platform == "win32":
        for name in ("npm.cmd", "npm.exe", "npm"):
            p = shutil.which(name)
            if p:
                return p
    else:
        p = shutil.which("npm")
        if p:
            return p
    print(
        "npm 없음 - Node.js 설치 후 터미널 재시작. (Windows: PATH 에 npm.cmd)",
        file=sys.stderr,
    )
    sys.exit(2)


def find_aws_exe() -> str:
    prepend_aws_to_path()
    for name in ("aws.exe", "aws.cmd", "aws"):
        p = shutil.which(name)
        if p:
            return p
    print(
        "AWS CLI 없음: winget install -e --id Amazon.AWSCLI 후 재시작 또는 PATH 확인.",
        file=sys.stderr,
    )
    sys.exit(2)


def disable_aws_cli_pager() -> None:
    """Windows 터미널에서 출력이 비는 경우를 줄이기 위해 자식 프로세스에도 적용."""
    os.environ["AWS_PAGER"] = ""


def sts_get_caller_identity(aws_exe: str, repo: Path) -> tuple[bool, str]:
    r = subprocess.run(
        [aws_exe, "sts", "get-caller-identity", "--output", "json"],
        cwd=str(repo),
        capture_output=True,
        text=True,
        timeout=90,
    )
    out = (r.stdout or "").strip()
    err = (r.stderr or "").strip()
    blob = "\n".join(x for x in (out, err) if x)
    if r.returncode == 0 and out and '"Account"' in out:
        return True, out
    return False, blob or f"(코드 {r.returncode}, stdout/err 비었음 가능)"


def auth_failure_suggests_refresh(message: str) -> bool:
    low = message.lower()
    needles = (
        "reauthenticate",
        "aws login",
        "session has expired",
        "expiredtoken",
        "token expired",
        "token has expired",
        "sso_token_expired",
        "sso session",
        "refresh failed",
        "invalid_grant",
        "unable to locate credentials",
        "could not load credentials",
        "error loading SSO Token",
        "the sso session associated with this profile has expired",
    )
    return any(n in low for n in needles)


def profile_has_sso(aws_exe: str, profile: str) -> bool:
    if not profile:
        return False
    r = subprocess.run(
        [aws_exe, "configure", "get", "sso_start_url", "--profile", profile],
        cwd=os.path.expanduser("~"),
        capture_output=True,
        text=True,
        timeout=45,
    )
    return bool((r.stdout or "").strip())


def run_interactive(cmd: list[str], *, cwd: Path) -> bool:
    print("== " + " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=str(cwd)).returncode == 0


def ensure_aws_cli_session(aws_exe: str, repo: Path) -> None:
    """STS 성공까지: 만료 등이면 sso/login 자동 시도(대화형 가능)."""
    disable_aws_cli_pager()
    ok, detail = sts_get_caller_identity(aws_exe, repo)
    if ok:
        return
    if not auth_failure_suggests_refresh(detail):
        print(
            "AWS STS 실패(자격 증명/권한 이슈로 보입니다). 필요 시 AWS_PROFILE 과 aws configure 상태를 확인하세요.\n"
            + detail,
            file=sys.stderr,
        )
        sys.exit(1)
    profile = (os.environ.get("AWS_PROFILE") or "").strip()
    print(
        "AWS CLI 세션 없음 또는 만료 감지 - 자동 재인증을 시도합니다 "
        "(SSO/브라우저 창이 뜨면 완료만 해 주세요).",
        flush=True,
    )
    refreshed = False
    if profile and profile_has_sso(aws_exe, profile):
        refreshed = run_interactive(
            [aws_exe, "sso", "login", "--profile", profile],
            cwd=repo,
        )
    if not refreshed:
        login_cmds = [[aws_exe, "login"]]
        if profile:
            login_cmds.insert(0, [aws_exe, "login", "--profile", profile])
        for lc in login_cmds:
            if run_interactive(lc, cwd=repo):
                refreshed = True
                break
    if not refreshed:
        print(
            "참고: 대화형 로그인이 실패했거나 취소된 경우 STS가 계속 실패할 수 있습니다. "
            "`aws configure`/IAM 키 또는 `AWS_PROFILE`+`aws sso login` 상태를 확인하세요.",
            file=sys.stderr,
        )
    ok2, detail2 = sts_get_caller_identity(aws_exe, repo)
    if not ok2:
        print(
            "AWS 재인증 후에도 STS 실패 - 터미널에서 직접 확인:\n"
            "  aws sts get-caller-identity\n"
            + detail2,
            file=sys.stderr,
        )
        sys.exit(1)
    print("AWS CLI 세션 OK (get-caller-identity).", flush=True)


def run(cmd: list[str], *, cwd: Path) -> None:
    print("== " + " ".join(cmd[:6]) + (" ..." if len(cmd) > 6 else ""), flush=True)
    r = subprocess.run(cmd, cwd=str(cwd))
    if r.returncode != 0:
        sys.exit(r.returncode)


def read_cf_id_file(scripts_dir: Path) -> str | None:
    p = scripts_dir / "cloudfront-distribution-id"
    if not p.is_file():
        return None
    line = p.read_text(encoding="utf-8", errors="replace").strip().split("\n")[0].strip()
    if not line or line.startswith("#"):
        return None
    return line


def resolve_cloudfront_distribution_id(aws_exe: str, bucket: str) -> str | None:
    try:
        out = subprocess.check_output(
            [aws_exe, "cloudfront", "list-distributions", "--output", "json", "--region", "us-east-1"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=120,
        )
        data = json.loads(out)
        items = (data.get("DistributionList") or {}).get("Items") or []
        for it in items:
            aliases = (it.get("Aliases") or {}).get("Items") or []
            for a in aliases:
                if isinstance(a, str) and "magicindicatorglobal.com" in a.lower():
                    return it.get("Id")
        escaped = re.escape(bucket)
        for it in items:
            for o in (it.get("Origins") or {}).get("Items") or []:
                dn = str(o.get("DomainName") or "")
                if re.search(escaped, dn, re.I):
                    return it.get("Id")
    except (subprocess.CalledProcessError, OSError, json.JSONDecodeError, subprocess.TimeoutExpired):
        return None
    return None


def main() -> None:
    root = repo_root()
    scripts = root / "scripts"
    os.chdir(root)
    disable_aws_cli_pager()
    if not (root / "index.html").is_file():
        print("index.html 없음 - 프로젝트 루트가 아닙니다.", file=sys.stderr)
        sys.exit(2)

    bucket = (os.environ.get("AWS_S3_BUCKET") or "").strip() or "magicindicator-global-web-6145"
    region = (os.environ.get("AWS_REGION") or "").strip() or "us-east-1"

    npm = find_npm_exe()
    run([npm, "run", "verify"], cwd=root)

    aws = find_aws_exe()
    ensure_aws_cli_session(aws, root)
    target = f"s3://{bucket}/"

    common_excludes = [
        "--exclude",
        "node_modules/*",
        "--exclude",
        ".git/*",
        "--exclude",
        ".cursor/*",
        "--exclude",
        ".gitignore",
        "--exclude",
        "*.ps1",
        "--exclude",
        "package.json",
        "--exclude",
        "package-lock.json",
        "--exclude",
        ".env",
        "--exclude",
        ".env.*",
        "--exclude",
        "scripts/*",
        "--exclude",
        "tools/*",
        "--exclude",
        "docs/*",
        "--exclude",
        "*.md",
    ]

    print(f"== aws s3 sync -> {target} (region {region})", flush=True)
    sync_main = (
        [
            aws,
            "s3",
            "sync",
            str(root),
            target,
            "--delete",
            "--region",
            region,
        ]
        + common_excludes
    )
    run(sync_main, cwd=root)

    print("== aws s3 sync (HTML only, short cache)", flush=True)
    sync_html = [
        aws,
        "s3",
        "sync",
        str(root),
        target,
        "--region",
        region,
        "--exclude",
        "*",
        "--include",
        "*.html",
        "--exclude",
        "node_modules/*",
        "--exclude",
        ".git/*",
        "--exclude",
        ".cursor/*",
        "--exclude",
        "scripts/*",
        "--exclude",
        "tools/*",
        "--exclude",
        "docs/*",
        "--cache-control",
        "public, max-age=0, must-revalidate, s-maxage=60",
    ]
    run(sync_html, cwd=root)

    cf_id = (os.environ.get("CLOUDFRONT_DISTRIBUTION_ID") or "").strip() or ""
    if not cf_id:
        cf_id = read_cf_id_file(scripts) or ""
    if not cf_id:
        resolved = resolve_cloudfront_distribution_id(aws, bucket)
        if resolved:
            cf_id = resolved
            print(f"CloudFront distribution id (auto): {cf_id}", flush=True)

    if cf_id:
        print(f"== CloudFront invalidation: {cf_id}", flush=True)
        run(
            [
                aws,
                "cloudfront",
                "create-invalidation",
                "--distribution-id",
                cf_id,
                "--paths",
                "/*",
                "--region",
                "us-east-1",
            ],
            cwd=root,
        )
        print("Invalidation 요청 완료(몇 분 소요 가능).", flush=True)
    else:
        print(
            "SKIP: CloudFront 무효화 - CLOUDFRONT_DISTRIBUTION_ID 또는 scripts/cloudfront-distribution-id",
            flush=True,
        )


if __name__ == "__main__":
    main()
