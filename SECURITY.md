# Security Policy

## Supported versions

Security fixes are provided for the current `0.1.x` release line.

| Version          | Supported |
| ---------------- | --------- |
| `0.1.x`          | Yes       |
| Earlier versions | No        |

## Security boundary

Resume LaTeX Editor is a local tool. The server binds to the loopback interface
only and has no authentication or authorization layer. Do not expose it through
a public interface, port forward, reverse proxy, or shared host.

The configured `RESUME_PROJECT_ROOT` is a trusted filesystem boundary. Anyone
who can change files inside that root can influence the LaTeX process, and LaTeX
documents may execute powerful TeX primitives. Use only roots and documents you
trust. The application confines file operations to discovered `.tex` files and
does not accept client-supplied compiler commands or absolute paths.

## Reporting a vulnerability

Please report vulnerabilities privately through a [GitHub private security
advisory](https://github.com/yihan35/resume_latex/security/advisories/new).
Include reproduction steps, affected versions, impact, and any suggested
mitigation. Do not open a public issue for an unpatched vulnerability.

You can expect an initial acknowledgement through the advisory and coordinated
disclosure after a fix is available.
