/*
 * imgf.c
 *
 * Extracting/Flashing Android system partition images.
 *
 * Commands:
 *   imgf list
 *   imgf flash <input> <partition>
 *   imgf extract <partition> <output>
 *
 * Build:
 *   gcc -O2 -o imgf imgf.c
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <limits.h>

#define SYSBLOCK "/sys/class/block"
#define DEVBLOCK "/dev/block"
#define BUFSZ    65536

/* ---------------- utils ---------------- */

static int read_text(const char *path, char *buf, size_t size)
{
    int fd = open(path, O_RDONLY);
    if (fd < 0) return -1;
    ssize_t n = read(fd, buf, size - 1);
    close(fd);
    if (n < 0) return -1;
    buf[n] = '\0';
    while (n > 0 && (buf[n-1] == '\n' || buf[n-1] == '\r' ||
                     buf[n-1] == ' '  || buf[n-1] == '\t'))
        buf[--n] = '\0';
    return 0;
}

static int is_file(const char *path)
{
    struct stat st;
    return stat(path, &st) == 0 && S_ISREG(st.st_mode);
}

static int is_dir(const char *path)
{
    struct stat st;
    return stat(path, &st) == 0 && S_ISDIR(st.st_mode);
}

static void fmt_size(unsigned long long bytes, char *out, size_t outsz)
{
    if (bytes >= 1073741824ULL)
        snprintf(out, outsz, "%lluGB", bytes / 1073741824ULL);
    else if (bytes >= 1048576ULL)
        snprintf(out, outsz, "%lluMB", bytes / 1048576ULL);
    else if (bytes >= 1024ULL)
        snprintf(out, outsz, "%lluKB", bytes / 1024ULL);
    else
        snprintf(out, outsz, "%lluB", bytes);
}

static const char *get_devtype(const char *name)
{
    char path[PATH_MAX];

    if (strncmp(name, "loop", 4) == 0) return "loop";
    if (strncmp(name, "dm-",  3) == 0) return "dm";

    snprintf(path, sizeof(path), SYSBLOCK "/%s/dm", name);
    if (is_dir(path)) return "dm";

    snprintf(path, sizeof(path), SYSBLOCK "/%s/partition", name);
    if (is_file(path)) return "partition";

    return "disk";
}

static int get_partname(const char *name, char *out, size_t outsz)
{
    char path[PATH_MAX];
    char buf[4096];

    snprintf(path, sizeof(path), SYSBLOCK "/%s/uevent", name);
    if (read_text(path, buf, sizeof(buf)) != 0) return -1;

    char *p = buf;
    while (*p) {
        if (strncmp(p, "PARTNAME=", 9) == 0) {
            char *val = p + 9;
            char *end = strchr(val, '\n');
            size_t len = end ? (size_t)(end - val) : strlen(val);
            if (len >= outsz) len = outsz - 1;
            memcpy(out, val, len);
            out[len] = '\0';
            return 0;
        }
        char *nl = strchr(p, '\n');
        if (!nl) break;
        p = nl + 1;
    }
    return -1;
}

static void get_parent(const char *name, char *out, size_t outsz)
{
    char path[PATH_MAX];
    char real[PATH_MAX];

    out[0] = '\0';
    snprintf(path, sizeof(path), SYSBLOCK "/%s", name);
    ssize_t n = readlink(path, real, sizeof(real) - 1);
    if (n < 0) return;
    real[n] = '\0';

    char *slash = strrchr(real, '/');
    if (!slash) return;
    *slash = '\0';
    char *base = strrchr(real, '/');
    base = base ? base + 1 : real;

    snprintf(out, outsz, "%s", base);
}

/* ---------------- list ---------------- */

struct devrow {
    char name[64];
    char type[16];
    char path[128];
    char partname[64];
    char parent[64];
    unsigned long long sectors;
    unsigned long long bytes;
    char size[32];
    char majmin[32];
    char ro[8];
    char removable[8];
};

static void collect(const char *name, struct devrow *r)
{
    char path[PATH_MAX];
    char buf[4096];

    memset(r, 0, sizeof(*r));
    snprintf(r->name, sizeof(r->name), "%s", name);
    snprintf(r->type, sizeof(r->type), "%s", get_devtype(name));
    snprintf(r->path, sizeof(r->path), DEVBLOCK "/%s", name);

    if (get_partname(name, r->partname, sizeof(r->partname)) != 0)
        snprintf(r->partname, sizeof(r->partname), "-");

    r->parent[0] = '\0';
    if (strcmp(r->type, "partition") == 0)
        get_parent(name, r->parent, sizeof(r->parent));
    if (r->parent[0] == '\0')
        snprintf(r->parent, sizeof(r->parent), "-");

    snprintf(path, sizeof(path), SYSBLOCK "/%s/size", name);
    if (read_text(path, buf, sizeof(buf)) == 0) {
        r->sectors = strtoull(buf, NULL, 10);
        r->bytes   = r->sectors * 512ULL;
        fmt_size(r->bytes, r->size, sizeof(r->size));
    } else {
        snprintf(r->size, sizeof(r->size), "-");
    }

    snprintf(path, sizeof(path), SYSBLOCK "/%s/dev", name);
    if (read_text(path, buf, sizeof(buf)) == 0)
        snprintf(r->majmin, sizeof(r->majmin), "%s", buf);
    else
        snprintf(r->majmin, sizeof(r->majmin), "-");

    snprintf(path, sizeof(path), SYSBLOCK "/%s/ro", name);
    if (read_text(path, buf, sizeof(buf)) == 0)
        snprintf(r->ro, sizeof(r->ro), "%s", buf);
    else
        snprintf(r->ro, sizeof(r->ro), "-");

    snprintf(path, sizeof(path), SYSBLOCK "/%s/removable", name);
    if (read_text(path, buf, sizeof(buf)) == 0)
        snprintf(r->removable, sizeof(r->removable), "%s", buf);
    else
        snprintf(r->removable, sizeof(r->removable), "-");
}

static int cmp_row(const void *a, const void *b)
{
    const struct devrow *ra = a;
    const struct devrow *rb = b;
    return strcmp(ra->name, rb->name);
}

static int cmd_list(void)
{
    DIR *dir = opendir(SYSBLOCK);
    if (!dir) { perror("opendir " SYSBLOCK); return 1; }

    struct devrow *rows = NULL;
    size_t count = 0, cap = 0;

    struct dirent *ent;
    while ((ent = readdir(dir)) != NULL) {
        if (ent->d_name[0] == '.') continue;

        if (count == cap) {
            cap = cap ? cap * 2 : 32;
            struct devrow *tmp = realloc(rows, cap * sizeof(*rows));
            if (!tmp) { perror("realloc"); free(rows); closedir(dir); return 1; }
            rows = tmp;
        }
        collect(ent->d_name, &rows[count]);
        count++;
    }
    closedir(dir);

    qsort(rows, count, sizeof(*rows), cmp_row);

    printf("%-16s %-10s %-24s %-16s %-14s %-12s %-14s %-8s %-10s %-3s %-10s\n",
           "NAME", "TYPE", "PATH", "PARTNAME", "PARENT",
           "SECTORS", "BYTES", "SIZE", "MAJMIN", "RO", "REMOVABLE");

    for (size_t i = 0; i < count; i++) {
        struct devrow *r = &rows[i];
        printf("%-16s %-10s %-24s %-16s %-14s %-12llu %-14llu %-8s %-10s %-3s %-10s\n",
               r->name, r->type, r->path, r->partname, r->parent,
               r->sectors, r->bytes, r->size, r->majmin,
               r->ro, r->removable);
    }

    free(rows);
    return 0;
}

/* ---------------- flash / extract ---------------- */

static int check_partition(const char *name)
{
    char path[PATH_MAX];
    snprintf(path, sizeof(path), SYSBLOCK "/%s/partition", name);
    if (!is_file(path)) {
        fprintf(stderr, "error: '%s' is not an Android partition\n", name);
        return -1;
    }
    return 0;
}

static int copy_fd(int ifd, int ofd)
{
    char *buf = malloc(BUFSZ);
    if (!buf) { perror("malloc"); return -1; }

    int rc = 0;
    for (;;) {
        ssize_t n = read(ifd, buf, BUFSZ);
        if (n < 0)  { perror("read");  rc = -1; break; }
        if (n == 0) break;

        ssize_t off = 0;
        while (off < n) {
            ssize_t w = write(ofd, buf + off, (size_t)(n - off));
            if (w < 0) { perror("write"); rc = -1; break; }
            off += w;
        }
        if (rc < 0) break;
    }

    free(buf);
    return rc;
}

static int cmd_flash(const char *input, const char *devname)
{
    if (check_partition(devname) != 0) return 1;

    char devpath[PATH_MAX];
    snprintf(devpath, sizeof(devpath), DEVBLOCK "/%s", devname);

    int ifd = open(input, O_RDONLY);
    if (ifd < 0) { perror(input); return 1; }

    int ofd = open(devpath, O_WRONLY | O_SYNC);
    if (ofd < 0) { perror(devpath); close(ifd); return 1; }

    int rc = copy_fd(ifd, ofd);
    if (rc == 0) fsync(ofd);

    close(ifd);
    close(ofd);
    return rc == 0 ? 0 : 1;
}

static int cmd_extract(const char *devname, const char *output)
{
    if (check_partition(devname) != 0) return 1;

    char devpath[PATH_MAX];
    snprintf(devpath, sizeof(devpath), DEVBLOCK "/%s", devname);

    int ifd = open(devpath, O_RDONLY);
    if (ifd < 0) { perror(devpath); return 1; }

    int ofd = open(output, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (ofd < 0) { perror(output); close(ifd); return 1; }

    int rc = copy_fd(ifd, ofd);

    close(ifd);
    close(ofd);
    return rc == 0 ? 0 : 1;
}

/* ---------------- main ---------------- */

static void usage(const char *argv0)
{
    fprintf(stderr,
        "%s : Extracting/Flashing Android system partition images."
        "Usage:\n"
        "  %s list\n"
        "  %s flash <input> <partition>\n"
        "  %s extract <partition> <output>\n",
        argv0,argv0, argv0, argv0);
}

int main(int argc, char **argv)
{
    if (argc < 2) { usage(argv[0]); return 1; }

    if (strcmp(argv[1], "list") == 0)
        return cmd_list();

    if (strcmp(argv[1], "flash") == 0) {
        if (argc < 4) { usage(argv[0]); return 1; }
        return cmd_flash(argv[2], argv[3]);
    }

    if (strcmp(argv[1], "extract") == 0) {
        if (argc < 4) { usage(argv[0]); return 1; }
        return cmd_extract(argv[2], argv[3]);
    }

    usage(argv[0]);
    return 1;
}