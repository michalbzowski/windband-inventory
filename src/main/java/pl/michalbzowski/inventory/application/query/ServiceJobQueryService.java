package pl.michalbzowski.inventory.application.query;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import pl.michalbzowski.inventory.application.command.ServiceJobNotFoundException;
import pl.michalbzowski.inventory.domain.inventory.ServiceJob;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobRepository;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobStatus;

/** Read side of the service board (decision B15): band list, optional status filter, detail. */
@Service
@RequiredArgsConstructor
public class ServiceJobQueryService {

    private final ServiceJobRepository serviceJobs;

    public List<ServiceJobView> list(Long bandId, ServiceJobStatus status) {
        List<ServiceJob> rows = (status == null)
                ? serviceJobs.findByBandIdOrderByCreatedAtDescIdDesc(bandId)
                : serviceJobs.findByBandIdAndStatusOrderByCreatedAtDescIdDesc(bandId, status);
        return rows.stream().map(ServiceJobView::from).toList();
    }

    public ServiceJobView view(Long id) {
        return ServiceJobView.from(
                serviceJobs.findById(id).orElseThrow(() -> new ServiceJobNotFoundException(id)));
    }

    /** Band of the job — for the REST guard (same family as PurchaseQueryService.bandOf). */
    public Long bandOf(Long id) {
        return serviceJobs.findById(id).map(ServiceJob::getBandId)
                .orElseThrow(() -> new ServiceJobNotFoundException(id));
    }

    /** REST projection; item name/serial resolved through the live reference. */
    public record ServiceJobView(
            long id,
            Long bandId,
            Long itemId,
            String itemName,
            String itemSerialNumber,
            Long reporterMemberId,
            String reporterName,
            ServiceJobStatus status,
            String note,
            String resolutionNote,
            Long createdByMemberId,
            String createdByName,
            LocalDateTime createdAt,
            LocalDateTime shippedAt,
            LocalDateTime returnedAt,
            LocalDateTime handedOverAt,
            LocalDateTime cancelledAt) {

        static ServiceJobView from(ServiceJob job) {
            return new ServiceJobView(
                    job.getId(),
                    job.getBandId(),
                    job.getItem().getId(),
                    job.getItem().getName(),
                    job.getItem().getSerialNumber(),
                    job.getReporterMemberId(),
                    job.getReporterName(),
                    job.getStatus(),
                    job.getNote(),
                    job.getResolutionNote(),
                    job.getCreatedByMemberId(),
                    job.getCreatedByName(),
                    job.getCreatedAt(),
                    job.getShippedAt(),
                    job.getReturnedAt(),
                    job.getHandedOverAt(),
                    job.getCancelledAt());
        }
    }
}
